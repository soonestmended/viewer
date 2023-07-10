const canvas = document.querySelector("canvas");

if (!navigator.gpu) {
  throw new Error("WebGPU not supported on this browser.");
}

const adapter = await navigator.gpu.requestAdapter();
if (!adapter) {
  throw new Error("No appropriate GPUAdapter found.");
}

const device = await adapter.requestDevice();
const context = canvas.getContext("webgpu");
const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
context.configure({
  device: device,
  format: canvasFormat,
});

// GLOBALS:
window.sliceIndex = 0;
window.volumeDim = [512, 512, 97]
window.h_flip = false;
window.v_flip = false;
let shaders = {};
let testDat, testLbl;
const HF5_URL = "test.hf5";
const SHADER_URLS = ["shaders/quad.wgsl"];

await fetch(HF5_URL)
  .then(function(response) {
    return response.arrayBuffer();
  })
  .then(function(buffer) {
    let f = new hdf5.File(buffer);
    testDat = f.get('dat');
    testLbl = f.get('lbl');
    console.log("Loaded volume successfully.");
    console.log("Dat: " + testDat.shape + " , " + testDat.dtype);
    console.log("Lbl: " + testLbl.shape + " , " + testLbl.dtype);
    volumeDim[0] = testDat.shape[2];
    volumeDim[1] = testDat.shape[1];
    volumeDim[2] = testDat.shape[0];
  })
  .catch(function() {
    console.log("Failed to load image volume");
  });

// load shaders -- block on this step

await Promise.all(SHADER_URLS.map(s => fetch(s).then(r => r.text()))).then((values) => {
  shaders.quad = values[0];
  console.log("Loaded " + values.length + " shaders.");
});

console.log(testDat.value[42341]);

function render() {
  const encoder = device.createCommandEncoder();

  // Start a render pass
  const pass = encoder.beginRenderPass({
    colorAttachments: [{
      view: context.getCurrentTexture().createView(),
      loadOp: "clear",
      clearValue: { r: 0, g: 0, b: 0.4, a: 1.0 },
      storeOp: "store",
    }]
  });
  pass.setPipeline(mainPipeline);
  pass.setBindGroup(0, mainBindgroup); // Updated!
  pass.setVertexBuffer(0, vertexBuffer);
  uniforms[2] = (sliceIndex + .5) / volumeDim[2];
  uniforms[4] = h_flip ? 1.0 : 0.0;
  uniforms[5] = v_flip ? 1.0 : 0.0;
  device.queue.writeBuffer(uniformBuffer, 0, uniforms);
  pass.draw(vertices.length / 4);

  // End the render pass and submit the command buffer
  pass.end();
  device.queue.submit([encoder.finish()]);
  requestAnimationFrame(render);
}

const textureDat = device.createTexture({
  dimension: "3d",
  size: volumeDim,
  format: 'r32float',
  usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
});
device.queue.writeTexture( {texture: textureDat}, Float32Array.from(testDat.value), {bytesPerRow: volumeDim[0]*4, rowsPerImage: volumeDim[1]}, volumeDim );

const textureLbl = device.createTexture({
  dimension: "3d",
  size: volumeDim,
  format: 'r8uint',
  usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
});
device.queue.writeTexture( {texture: textureLbl}, Uint8Array.from(testLbl.value), {bytesPerRow: volumeDim[0]*1, rowsPerImage: volumeDim[1]}, volumeDim );

const samplerDat = device.createSampler({magFilter: "nearest", minFilter: "nearest"});
const samplerLbl = device.createSampler({magFilter: "nearest", minFilter: "nearest"});

const mainShaderModule = device.createShaderModule({
  code: shaders.quad,
  label: "Quad shader",
});

const vertices = new Float32Array([
  //   X, Y, U, V
  -1, -1, 0, 0,
  1, -1, 1, 0,
  1,  1, 1, 1,

  -1, -1, 0, 0,
  1,  1, 1, 1,
  -1,  1, 0, 1,
]);

const vertexBuffer = device.createBuffer({
  label: "Quad vertices",
  size: vertices.byteLength,
  usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(vertexBuffer, /*bufferOffset=*/0, vertices);


const vertexBufferLayout = {
  arrayStride: 16,
  attributes: [{
    format: "float32x2",
    offset: 0,
    shaderLocation: 0, // Position, see vertex shader
  }, {
    format: "float32x2",
    offset: 8,
    shaderLocation: 1,
  }],
};

const uniforms = new Float32Array([
  400, 50, 0.0, 0.0,    // window, level, sliceIndex / depth, unused
  0.0, 0.0, 0.0, 0.0,   // h_flip, v_flip, unused, unused
]);

const uniformBuffer = device.createBuffer({
  label: "Quad uniforms",
  size: uniforms.byteLength,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(uniformBuffer, 0, uniforms);

// Create the bind group layout and pipeline layout.
const mainBindgroupLayout = device.createBindGroupLayout({
  label: "Uniforms bind group layout",
  entries: [{
    binding: 0,
    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
    buffer: {} // Grid uniform buffer
  },
  {
    binding: 1,
    visibility: GPUShaderStage.FRAGMENT,
    sampler: {type: "non-filtering"}
  },
  {
    binding: 2,
    visibility: GPUShaderStage.FRAGMENT,
    texture: {sampleType: "unfilterable-float", viewDimension: "3d"}
  },
  {
    binding: 3,
    visibility: GPUShaderStage.FRAGMENT,
    sampler: {type: "non-filtering"}
  },
  {
    binding: 4,
    visibility: GPUShaderStage.FRAGMENT,
    texture: {sampleType: "uint", viewDimension: "3d"},
  }],
});

// Create a bind group to pass the grid uniforms into the pipeline
const mainBindgroup = device.createBindGroup({
  label: "Uniforms bind group",
  layout: mainBindgroupLayout, // Updated Line
  entries: [{
    binding: 0,
    resource: { buffer: uniformBuffer },
  }, {
    binding: 1,
    resource: samplerDat,
  }, {
    binding: 2,
    resource: textureDat.createView(),
  }, {
    binding: 3,
    resource: samplerLbl,
  }, {
    binding: 4,
    resource: textureLbl.createView(),
  }],
});

const pipelineLayout = device.createPipelineLayout({
  label: "Main Pipeline Layout",
  bindGroupLayouts: [ mainBindgroupLayout ],
});

const mainPipeline = device.createRenderPipeline({
  label: "Main pipeline",
  layout: pipelineLayout,
  vertex: {
    module: mainShaderModule,
    entryPoint: "vertexMain",
    buffers: [vertexBufferLayout]
  },
  fragment: {
    module: mainShaderModule,
    entryPoint: "fragmentMain",
    targets: [{
      format: canvasFormat
    }]
  }
});

requestAnimationFrame(render);
