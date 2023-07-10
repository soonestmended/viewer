// import {sliceIndex} from "/js/main.js";

function clamp(val, low, high) {
  if (val > high) {
    val = high;
  }
  else if (val < low) {
    val = low;
  }
  return val;
}

document.addEventListener("keydown", (e) => {
  const keyName = e.key;
  if (keyName == "ArrowUp") {
    sliceIndex = clamp(sliceIndex - 1, 0, volumeDim[2] - 1);
  }
  else if (keyName == "ArrowDown") {
    sliceIndex = clamp(sliceIndex + 1, 0, volumeDim[2] - 1);
  }
  else if (keyName == "h") {
    h_flip = ~h_flip;
  }
  else if (keyName == 'v') {
    v_flip = ~v_flip;
  }

});
