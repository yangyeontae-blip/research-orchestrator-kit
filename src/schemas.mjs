import * as fs from 'node:fs/promises';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

export class SchemaRegistry {
  constructor(root) {
    this.root = path.resolve(root);
    this.ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(this.ajv);
    this.cache = new Map();
  }

  async validator(name) {
    if (this.cache.has(name)) return this.cache.get(name);
    const schema = JSON.parse(await fs.readFile(path.join(this.root, 'schemas', `${name}.schema.json`), 'utf8'));
    const validate = this.ajv.compile(schema);
    this.cache.set(name, validate);
    return validate;
  }

  async assert(name, value) {
    const validate = await this.validator(name);
    if (!validate(value)) {
      const detail = validate.errors.map(error => `${error.instancePath || '/'} ${error.message}`).join('; ');
      throw new Error(`${name} schema validation failed: ${detail}`);
    }
    return value;
  }
}

