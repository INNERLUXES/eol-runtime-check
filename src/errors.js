// An input error: the tool cannot read the folder at all, or an option cannot be used. The message is shown to the user
// and the exit code is 2.
export class InputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InputError';
  }
}
