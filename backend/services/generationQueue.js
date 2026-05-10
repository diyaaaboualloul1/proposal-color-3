// Simple in-memory FIFO queue for SRS generation jobs
const queue = [];
let isProcessing = false;
let currentMeta = null;
let lastJobStartedAt = null;

async function enqueue(job, meta = {}) {
  return new Promise((resolve, reject) => {
    queue.push({ job, resolve, reject, meta });
    processNext();
  });
}

const JOB_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes per job — large docs can take 10-12 min

async function processNext() {
  if (isProcessing || queue.length === 0) return;
  isProcessing = true;
  lastJobStartedAt = Date.now();
  const { job, resolve, reject, meta } = queue.shift();
  currentMeta = meta;

  // Hard timeout — kills the job if it takes too long
  let timeoutHandle;
  const timeoutPromise = new Promise((_, rej) => {
    timeoutHandle = setTimeout(() => {
      console.error(`[Queue] Job timed out after ${JOB_TIMEOUT_MS / 1000}s for projectId=${meta.projectId}`);
      rej(new Error(`Queue job timed out after ${JOB_TIMEOUT_MS / 1000 / 60} minutes`));
    }, JOB_TIMEOUT_MS);
  });

  try {
    const result = await Promise.race([job(), timeoutPromise]);
    clearTimeout(timeoutHandle);
    resolve(result);
  } catch (err) {
    clearTimeout(timeoutHandle);
    console.error(`[Queue] Job failed for projectId=${meta.projectId}: ${err.message}`);
    reject(err);
  } finally {
    isProcessing = false;
    currentMeta = null;
    lastJobStartedAt = null;
    // Always try to process next — even if this job failed
    setImmediate(processNext);
  }
}

function getQueueStatus() {
  return {
    queueLength: queue.length,
    isProcessing,
    currentJob: currentMeta,
    queue: queue.map(item => item.meta)
  };
}

// Safety watchdog — force-reset if a job is stuck for >6 minutes
setInterval(() => {
  if (isProcessing && lastJobStartedAt && (Date.now() - lastJobStartedAt > 11 * 60 * 1000)) {
    console.warn('[Queue] Watchdog: stuck job detected, force-resetting queue');
    isProcessing = false;
    queue.length = 0;
    currentMeta = null;
    lastJobStartedAt = null;
  }
}, 60 * 1000); // check every minute

module.exports = { enqueue, getQueueStatus };
