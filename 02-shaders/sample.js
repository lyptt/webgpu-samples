const OVERFLOW = 0xffffffff;

function createBufferInit(device, descriptor) {
  const contents = new Uint8Array(descriptor.contents);

  const alignMask = 4 - 1;
  const paddedSize = Math.max(
    (contents.byteLength + alignMask) & ~alignMask,
    4
  );

  const buffer = device.createBuffer({
    label: descriptor.label,
    usage: descriptor.usage,
    mappedAtCreation: true,
    size: paddedSize,
  });
  const data = new Uint8Array(buffer.getMappedRange());
  data.set(contents);
  buffer.unmap();
  return buffer;
}

async function runSample() {
  const $content = document.querySelector("#content");
  const $numbersInput = document.querySelector("#numbersInput");

  function log(message, ...others) {
    $content.innerHTML = `${$content.innerHTML || ""}<p>${message}</p>`;
    if (others && others.length) {
      $content.innerHTML = `${$content.innerHTML || ""}<pre>${JSON.stringify(
        others
      )
        .split("\\n")
        .join("<br />")}</pre>`;
    }
    scrollTo(0, document.body.scrollHeight);
  }

  try {
    const shaderSourceRequest = await fetch("shader.wgsl");
    const shaderSource = await shaderSourceRequest.text();

    log("Fetched shader source code", shaderSource);

    const numbers = new Uint32Array(
      ($numbersInput.value?.trim() || "1, 4, 3, 295")
        .split(",")
        .map((val) => Number(val.trim()))
        .filter((val) => !isNaN(val))
    );

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      log("Failed to acquire gpu adapter");
      return;
    }

    const device = await adapter.requestDevice();
    if (!device) {
      log("Failed to acquire device from gpu adapter");
      return;
    }

    const shaderModule = device.createShaderModule({
      code: shaderSource,
    });

    log("Compiled shader source to shader module");

    const stagingBuffer = device.createBuffer({
      size: numbers.byteLength,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    const storageBuffer = createBufferInit(device, {
      label: "Storage Buffer",
      usage:
        GPUBufferUsage.STORAGE |
        GPUBufferUsage.COPY_DST |
        GPUBufferUsage.COPY_SRC,
      contents: numbers.buffer,
    });

    log("Copied values to storage buffer", ...numbers);

    log("Created staging and storage buffers");

    const computePipeline = device.createComputePipeline({
      layout: "auto",
      compute: {
        module: shaderModule,
        entryPoint: "main",
      },
    });

    const bindGroupLayout = computePipeline.getBindGroupLayout(0);
    const bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: {
            buffer: storageBuffer,
          },
        },
      ],
    });

    log("Created compute pipeline");

    const encoder = device.createCommandEncoder();

    const computePass = encoder.beginComputePass();
    computePass.setPipeline(computePipeline);
    computePass.setBindGroup(0, bindGroup);
    computePass.insertDebugMarker("compute collatz iterations");
    computePass.dispatchWorkgroups(numbers.length);
    computePass.end();

    encoder.copyBufferToBuffer(
      storageBuffer,
      0,
      stagingBuffer,
      0,
      numbers.byteLength
    );

    log("Encoded compute command to command encoder");

    device.queue.submit([encoder.finish()]);

    log("Submitted commands to device");

    await stagingBuffer.mapAsync(1);
    const arrayBufferData = stagingBuffer.getMappedRange();
    const uintData = new Uint32Array(arrayBufferData);
    const checkedData = Array.from(uintData).map((n) => {
      if (n === OVERFLOW) {
        return NaN;
      } else {
        return n;
      }
    });
    log("Received values from compute shader", ...checkedData);
    stagingBuffer.unmap();
  } catch (err) {
    log("Sample failed", err.toString());
  }
}

function run() {
  const $runButton = document.querySelector("#runButton");
  $runButton.addEventListener("click", runSample);
}

if (document.readyState != "loading") run();
else if (document.addEventListener)
  document.addEventListener("DOMContentLoaded", run);
else
  document.attachEvent("onreadystatechange", function () {
    if (document.readyState == "complete") run();
  });
