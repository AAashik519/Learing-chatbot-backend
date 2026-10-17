function write(level, payload) {
  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    ...payload,
  });
  if (level === 'error') {
    console.error(line);
    return;
  }
  if (process.env.NODE_ENV !== 'test') {
    console.log(line);
  }
}

export const logger = {
  info(payload) {
    write('info', payload);
  },
  error(payload) {
    write('error', payload);
  },
};
