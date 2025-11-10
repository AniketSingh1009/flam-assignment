import fs from 'fs';

export class Config {
  constructor(configPath = 'config.json') {
    this.configPath = configPath;
    this.initConfig();
  }

  initConfig() {
    if (!fs.existsSync(this.configPath)) {
      const defaults = {
        'max-retries': 3,
        'backoff-base': 2
      };
      fs.writeFileSync(this.configPath, JSON.stringify(defaults, null, 2));
    }
  }

  readConfig() {
    const data = fs.readFileSync(this.configPath, 'utf8');
    return JSON.parse(data);
  }

  writeConfig(config) {
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
  }

  set(key, value) {
    const config = this.readConfig();
    config[key] = isNaN(value) ? value : Number(value);
    this.writeConfig(config);
  }

  get(key) {
    const config = this.readConfig();
    return config[key] !== undefined ? config[key] : null;
  }

  getAll() {
    return this.readConfig();
  }
}
