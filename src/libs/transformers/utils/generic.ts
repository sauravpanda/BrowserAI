export const Callable = /** @type {any} */ class {
  constructor() {
    let closure = function (this: any, ...args: any[]): any {
      return (closure as any)._call(...args);
    };
    return Object.setPrototypeOf(closure, new.target.prototype);
  }

  _call(...args: any[]) {
    throw Error('Must implement _call method in subclass');
  }
};
