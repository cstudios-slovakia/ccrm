/**
 * Node's ESM resolver wants file extensions; the TypeScript under tests/ is written
 * for bundlers and omits them (`from './demoData'`). This hook retries a failed
 * relative import with `.ts`, which is all the capture script needs to reuse
 * tests/demo/ as it is.
 */
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (err?.code === 'ERR_MODULE_NOT_FOUND' && /^\.\.?\//.test(specifier) && !/\.[cm]?[jt]s$/.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    throw err;
  }
}
