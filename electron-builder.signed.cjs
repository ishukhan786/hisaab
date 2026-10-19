// Opt-in signing configuration for electron-builder 25.1.x.
const base = require('./package.json').build;
const thumbprint = (process.env.HISAAB_SIGNING_THUMBPRINT || '').trim();
const publisher = (process.env.HISAAB_SIGNING_PUBLISHER || '').trim();
if (!/^[a-f\d]{40}$/i.test(thumbprint) || !publisher) {
  throw new Error('Run npm run dist:signed after installing your verified code-signing certificate.');
}
module.exports = {
  ...base,
  forceCodeSigning: true,
  directories: { ...base.directories, output: 'dist/signed' },
  win: {
    ...base.win,
    signtoolOptions: {
      certificateSha1: thumbprint,
      publisherName: publisher,
      signingHashAlgorithms: ['sha256'],
      rfc3161TimeStampServer: 'http://timestamp.digicert.com'
    }
  }
};
