async function runSample() {
  const $content = document.querySelector("#content");

  function log(message, ...others) {
    $content.innerHTML = `${$content.innerHTML || ""}<p>${message}</p>`;
    if (others && others.length) {
      $content.innerHTML = `${$content.innerHTML || ""}<code>${JSON.stringify(
        others
      )}</code>`;
    }
    scrollTo(0, document.body.scrollHeight);
  }

  try {
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

    // Get a GPU buffer in a mapped state and an arrayBuffer for writing.
    const gpuWriteBuffer = device.createBuffer({
      mappedAtCreation: true,
      size: 4,
      usage: GPUBufferUsage.MAP_WRITE | GPUBufferUsage.COPY_SRC,
    });
    const arrayBuffer = gpuWriteBuffer.getMappedRange();

    log("Filling CPU buffer with values", [0, 1, 2, 3]);

    // Write bytes to buffer.
    new Uint8Array(arrayBuffer).set([0, 1, 2, 3]);

    // Unmap buffer so that it can be used later for copy.
    gpuWriteBuffer.unmap();

    // Get a GPU buffer for reading in an unmapped state.
    const gpuReadBuffer = device.createBuffer({
      mappedAtCreation: false,
      size: 4,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    log(
      "Enqueuing copy command to transfer data from CPU buffer to GPU buffer"
    );

    // Encode commands for copying buffer to buffer.
    const commandEncoder = device.createCommandEncoder();

    commandEncoder.copyBufferToBuffer(
      gpuWriteBuffer /* source buffer */,
      0 /* source offset */,
      gpuReadBuffer /* destination buffer */,
      0 /* destination offset */,
      4 /* size */
    );

    log("Submitting copy command to device queue");

    // Submit copy commands.
    const copyCommands = commandEncoder.finish();
    device.queue.submit([copyCommands]);

    // Read buffer.
    await gpuReadBuffer.mapAsync(GPUMapMode.READ);
    const copyArrayBuffer = gpuReadBuffer.getMappedRange();

    log("Received data from GPU", ...new Uint8Array(copyArrayBuffer));
  } catch (err) {
    log("Sample failed", err);
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
