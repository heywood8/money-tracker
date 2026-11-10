// Awaits a promise but gives up after timeoutMs. Every outcome becomes a value, so a rejection
// that lands after the timeout cannot surface as an unhandled rejection; the timer is cleared
// either way so a promise that settled at once leaves nothing pending behind it.
//
// Resolves with { status: 'resolved', value }, { status: 'rejected', error } or
// { status: 'pending' } when the time ran out first.
export const settleWithin = (promise, timeoutMs) => {
  let timer = null;
  const timedOut = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ status: 'pending' }), timeoutMs);
  });
  const settled = promise.then(
    (value) => ({ status: 'resolved', value }),
    (error) => ({ status: 'rejected', error }),
  );
  return Promise.race([settled, timedOut]).finally(() => clearTimeout(timer));
};

export default settleWithin;
