// import {sliceIndex} from "/js/main.js";

const canvas = document.querySelector("canvas");

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
    hFlip = !hFlip;
  }
  else if (keyName == 'v') {
    vFlip = !vFlip;
  }
  else if (keyName == 'm') {
    showMasks = !showMasks;
  }
});

canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  let dz = -1
  if (e.deltaY > 0) {
    dz = 1;
  }
  sliceIndex = clamp(sliceIndex + dz, 0, volumeDim[2] - 1);
});



canvas.addEventListener("mousemove", (e) => {
  e.preventDefault();
  if (e.buttons == 1) {
    if (e.movementX > 0) {
      window.displayWindow += 1;
    }
    else if (e.movementX < 0) {
      window.displayWindow -= 1;
    }
    if (e.movementY > 0) {
     window.displayLevel -= 1; 
    }
    else if (e.movementY < 0){
      window.displayLevel += 1;
    }
  }
});
