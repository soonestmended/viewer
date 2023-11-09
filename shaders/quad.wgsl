struct VertexInput {
  @location(0) pos: vec2f,
  @location(1) texCoord: vec2f,
  @builtin(instance_index) instance: u32,
};

struct VertexOutput {
  @builtin(position) pos: vec4f,
  @location(0) texCoord: vec2f,
};

struct ViewParams {
  window: f32,
  level: f32,
  slicePos: f32,
  show_masks: f32,
  h_flip: f32,
  v_flip: f32,
  pad_1: f32,
  pad_2: f32,
};


@group(0) @binding(0) var<uniform> viewInfo: ViewParams; // (window, level, sliceIndex / depth, <empty>)
//@group(0) @binding(1) var<storage> cellState: array<u32>; // New!

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput  {
  let i = f32(input.instance);

  var output: VertexOutput;
  output.pos = vec4f(input.pos, 0, 1);
  output.texCoord = input.texCoord;
  return output;
}

@group(0) @binding(1) var smpDat: sampler;
@group(0) @binding(2) var texDat: texture_3d<f32>;
@group(0) @binding(3) var texLbl: texture_3d<u32>;

const COLOR_MAP = array(
  vec4f(1.0),
  vec4f(1.0, 0.0, 0.0, 1.0),
  vec4f(0.0, 1.0, 0.0, 1.0),
  vec4f(0.0, 0.0, 1.0, 1.0),
  vec4f(1.0, 1.0, 0.0, 1.0),
  vec4f(1.0, 0.0, 1.0, 1.0),
  vec4f(0.0, 1.0, 1.0, 1.0),
);

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  let texCoord = vec2f(abs(viewInfo.h_flip - input.texCoord.x), abs(viewInfo.v_flip - input.texCoord.y));
  let hu_val = textureSample(texDat, smpDat, vec3f(texCoord, viewInfo.slicePos)).r;
  let hu_range = vec2f(viewInfo.level - (viewInfo.window / 2.0), viewInfo.level + (viewInfo.window / 2.0));
  let texLbl_dim = textureDimensions(texLbl);
  let texCoord_uint = vec3f(texCoord, viewInfo.slicePos) * vec3f(texLbl_dim);
  let voxel_class = textureLoad(texLbl, vec3u(texCoord_uint), 0).r;

  let intensity = vec4f(vec3f((hu_val - hu_range.x) / (hu_range.y - hu_range.x)), 1.0);
  var color = COLOR_MAP[voxel_class];
  if (viewInfo.show_masks < .5) {
    color = COLOR_MAP[0];
  }
  return color * intensity;
}
