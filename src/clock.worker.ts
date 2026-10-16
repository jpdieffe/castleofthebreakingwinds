// Keep the host simulation clock running when its tab is in the background.
setInterval(() => postMessage(null), 100);
