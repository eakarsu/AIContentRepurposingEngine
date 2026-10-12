'use strict';

/** A disconnected client cancels its provider call and any uncommitted save. */
function requestCancellation(req, res) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const disconnected = () => { if (!res.writableEnded) abort(); };
  req.once('aborted', abort);
  res.once('close', disconnected);
  if (req.aborted || res.destroyed) abort();
  return {
    signal: controller.signal,
    assertActive() {
      if (controller.signal.aborted) throw Object.assign(new Error('Request cancelled'), { name: 'AbortError' });
    },
    dispose() { req.removeListener('aborted', abort); res.removeListener('close', disconnected); },
  };
}

module.exports = { requestCancellation };
