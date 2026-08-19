# Contributing

Issues and pull requests are welcome. Keep platform-specific behavior in the adapter or policy layer, and do not copy vendor API schemas or credential stores into this repository.

Before submitting a change:

```bash
npm install
npm run check
npm run pack:check
```

Changes to command classification must include focused tests for read, write, destructive, denied, and dry-run behavior. Changes to optional vendor versions should run `dsh-office doctor` and at least one read-only smoke command for every affected platform.

Never commit credentials, QR authorization artifacts, enterprise identifiers, message contents, or captured production output. Use synthetic fixtures.
