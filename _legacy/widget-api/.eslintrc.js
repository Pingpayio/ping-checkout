// .eslintrc.js - Enforce separation between on-ramp and intents

module.exports = {
  env: {
    node: true,
    es2022: true
  },
  extends: [
    'eslint:recommended'
  ],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module'
  },
  rules: {
    // Enforce separation: intents code cannot import on-ramp code
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['../onramp/*', './onramp/*', '*/onramp/*'],
            message: 'Intents code cannot import on-ramp modules. Use separate namespaces.'
          },
          {
            group: ['../onramp', './onramp', '*/onramp'],
            message: 'Intents code cannot import on-ramp modules. Use separate namespaces.'
          }
        ]
      }
    ],
    
    // Enforce separation: on-ramp code cannot import intents code
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['../intents/*', './intents/*', '*/intents/*'],
            message: 'On-ramp code cannot import intents modules. Use separate namespaces.'
          },
          {
            group: ['../intents', './intents', '*/intents'],
            message: 'On-ramp code cannot import intents modules. Use separate namespaces.'
          }
        ]
      }
    ],

    // Prevent direct process.env usage in business logic
    'no-process-env': 'warn',
    
    // Enforce consistent error handling
    'no-throw-literal': 'error',
    
    // Prevent console.log in production
    'no-console': process.env.NODE_ENV === 'production' ? 'error' : 'warn'
  },
  
  // Override rules for specific files
  overrides: [
    {
      // Allow process.env in config files
      files: ['**/config.js', '**/config/**/*.js', 'server.js'],
      rules: {
        'no-process-env': 'off'
      }
    },
    {
      // Stricter rules for on-ramp code
      files: ['src/lib/onramp/**/*.js', 'src/services/onramp/**/*.js'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['../intents/*', './intents/*', '*/intents/*'],
                message: 'On-ramp code is frozen. Cannot import intents modules.'
              }
            ]
          }
        ]
      }
    },
    {
      // Stricter rules for intents code
      files: ['src/services/intents/**/*.js', 'src/routes/intents/**/*.js'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['../onramp/*', './onramp/*', '*/onramp/*'],
                message: 'Intents code cannot import on-ramp modules. Use separate namespaces.'
              }
            ]
          }
        ]
      }
    }
  ]
};
