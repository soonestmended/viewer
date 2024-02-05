// import h5wasm from "https://cdn.jsdelivr.net/npm/h5wasm@0.4.9/dist/esm/hdf5_hl.js";
// const Module = await h5wasm.ready;
// const {FS} = Module;


window.openFile = async () => {
  let fileHandle;
  [fileHandle] = await window.showOpenFilePicker();
  const file = await fileHandle.getFile();
  const contents = await file.arrayBuffer();
  let f = new hdf5.File(contents);
  // FS.writeFile("current.h5", new Uint8Array(contents), {flags: "w+"});
  // let f = new h5wasm.File("current.h5", "r");
  let keys = f.keys;
  if (keys.includes('dat')) {
    testDat = f.get('dat');
  } else if (keys.includes('data')) {
    testDat = f.get('data');
  } else {
    testDat = f.get(keys[0]);
  }
  if (keys.includes('lbl')) {
    testLbl = f.get('lbl');
  }

  console.log("Loaded volume successfully.");
  console.log("Dat: " + testDat.shape + " , " + testDat.dtype);
  console.log("Lbl: " + testLbl.shape + " , " + testLbl.dtype);
  updateTextures(testDat, testLbl, [testDat.shape[2], testDat.shape[1], testDat.shape[0]]);
  updateBindGroup();
};

let textureDat, textureLbl;
let mainBindGroup;

function updateTextures(dat, lbl, dim) {
  volumeDim[0] = dim[0];
  volumeDim[1] = dim[1];
  volumeDim[2] = dim[2];
  textureDat = device.createTexture({
    dimension: "3d",
    size: volumeDim,
    format: 'r32float',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture( {texture: textureDat}, Float32Array.from(dat.value), {bytesPerRow: volumeDim[0]*4, rowsPerImage: volumeDim[1]}, volumeDim );

  textureLbl = device.createTexture({
    dimension: "3d",
    size: volumeDim,
    format: 'r8uint',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture( {texture: textureLbl}, Uint8Array.from(lbl.value), {bytesPerRow: volumeDim[0]*1, rowsPerImage: volumeDim[1]}, volumeDim );
}

function updateBindGroup() {
  mainBindGroup = device.createBindGroup({
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
      resource: textureLbl.createView(),
    }],
  });
}

const canvas = document.querySelector("canvas");

if (!navigator.gpu) {
  throw new Error("WebGPU not supported on this browser.");
}

const adapter = await navigator.gpu.requestAdapter();
if (!adapter) {
  throw new Error("No appropriate GPUAdapter found.");
}

const device = await adapter.requestDevice({requiredLimits: {maxBufferSize: 1073741824}});
console.log("Max buffer size: " + device.limits.maxBufferSize);
const context = canvas.getContext("webgpu");
const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
context.configure({
  device: device,
  format: canvasFormat,
});

// GLOBALS:
window.displayWindow = 400;
window.displayLevel = 50;
window.sliceIndex = 0;
window.volumeDim = [0, 0, 0]
window.hFlip = false;
window.vFlip = true;
window.showMasks = true;
let shaders = {};
let testDat, testLbl;
const HF5_URL = "00546.hf5";
const SHADER_URLS = ["shaders/quad.wgsl"];

await fetch(HF5_URL)
  .then(function(response) {
    return response.arrayBuffer();
  })
  .then(function(buffer) {

    let f = new hdf5.File(buffer);
    testDat = f.get('dat_5x3x3');
    testLbl = f.get('lbl_5x3x3');
    console.log("Loaded volume successfully.");
    console.log("Dat: " + testDat.shape + " , " + testDat.dtype);
    console.log("Lbl: " + testLbl.shape + " , " + testLbl.dtype);
    updateTextures(testDat, testLbl, [testDat.shape[2], testDat.shape[1], testDat.shape[0]]);
//    volumeDim[0] = testDat.shape[2];
//    volumeDim[1] = testDat.shape[1];
//    volumeDim[2] = testDat.shape[0];

  })
  .catch(function(error) {
    console.log("Failed to load image volume");
    console.log(error);
  });

// load shaders -- block on this step

await Promise.all(SHADER_URLS.map(s => fetch(s).then(r => r.text()))).then((values) => {
  shaders.quad = values[0];
  console.log("Loaded " + values.length + " shaders.");
});


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
  pass.setBindGroup(0, mainBindGroup); // Updated!
  pass.setVertexBuffer(0, vertexBuffer);
  uniforms[0] = displayWindow;
  uniforms[1] = displayLevel;
  uniforms[2] = (sliceIndex + .5) / volumeDim[2];
  uniforms[3] = showMasks ? 1.0 : 0.0;
  uniforms[4] = hFlip ? 1.0 : 0.0;
  uniforms[5] = vFlip ? 1.0 : 0.0;
  device.queue.writeBuffer(uniformBuffer, 0, uniforms);
  pass.draw(vertices.length / 4);

  // End the render pass and submit the command buffer
  pass.end();
  device.queue.submit([encoder.finish()]);
  requestAnimationFrame(render);
}

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
    texture: {sampleType: "uint", viewDimension: "3d"},
  }],
});

// Create a bind group to pass the grid uniforms into the pipeline
updateBindGroup();

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
