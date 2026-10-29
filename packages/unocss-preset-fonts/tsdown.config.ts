import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    './src/index.ts',
  ],
  noExternal: [
    '@proj-aipets/font-cjkfonts-allseto',
    '@proj-aipets/font-departure-mono',
    '@proj-aipets/font-xiaolai',
  ],
  dts: true,
  sourcemap: true,
})
