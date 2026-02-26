import naily from 'naily-eslint-config'

export default naily({
  type: 'lib',
  rules: {
    'no-restricted-syntax': 'off',
    'ts/prefer-literal-enum-member': 'off',
  },
  typescript: {
    parserOptions: {
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
    },
  },
})
