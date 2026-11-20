// Lets Node load the browser code's extensionless imports (`./derive` -> `./derive.ts`)
// so command-line tools can run the document generator. Used by `npm run check:docs`.
import { register } from 'node:module';

const hook = `
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (err) {
    if (/^\\.{1,2}\\//.test(specifier) && !/\\.[cm]?[jt]sx?$/.test(specifier)) return next(specifier + '.ts', context);
    throw err;
  }
}`;
register('data:text/javascript,' + encodeURIComponent(hook));
