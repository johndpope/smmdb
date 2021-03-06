const webpack = require('webpack')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const ScriptExtHtmlWebpackPlugin = require('script-ext-html-webpack-plugin')
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin')
const ReactLoadablePlugin = require('react-loadable/webpack').ReactLoadablePlugin

const path = require('path')

const { port, domain } = require('./environment')['dev']

module.exports = [
  {
    mode: 'development',
    entry: path.join(__dirname, '../src/client/renderer.tsx'),
    output: {
      filename: 'app.js',
      path: path.join(__dirname, '../build/client/scripts'),
      publicPath: '/scripts/'
    },
    devtool: 'inline-source-map',
    node: {
      __dirname: false,
      __filename: false,
      console: true,
      fs: 'empty',
      net: 'empty',
      tls: 'empty',
      child_process: 'empty'
    },
    optimization: {
      runtimeChunk: {
        name: 'manifest'
      }
    },
    plugins: [
      new webpack.EnvironmentPlugin({
        NODE_ENV: 'development',
        IS_SERVER: false,
        PORT: port,
        DOMAIN: domain
      }),
      new HtmlWebpackPlugin({
        filename: '../index.html',
        template: 'build/static/views/template.html'
      }),
      new ScriptExtHtmlWebpackPlugin({
        preload: /\.js/
      }),
      new ReactLoadablePlugin({
        filename: './build/react-loadable.json'
      })
    ],
    resolve: {
      extensions: [ '.ts', '.tsx', '.js', '.jsx', '.json' ],
      plugins: [
        new TsconfigPathsPlugin({
          configFile: './tsconfig.json'
        })
      ]
    },
    watchOptions: {
      ignored: [
        /build\/.*/
      ]
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          exclude: /node_modules/,
          use: [
            {
              loader: 'awesome-typescript-loader',
              options: {
                useBabel: true,
                babelOptions: {
                  babelrc: false,
                  presets: [
                    ['@babel/env', {
                      targets: {
                        browsers: [
                          'last 3 Chrome versions',
                          'last 2 ff versions'
                        ]
                      },
                      modules: false,
                      useBuiltIns: 'usage'
                    }],
                    '@babel/react'
                  ],
                  plugins: [
                    'react-loadable/babel',
                    '@babel/plugin-syntax-dynamic-import'
                  ]
                }
              }
            }
          ]
        },
        {
          test: /\.html$/,
          loader: 'html-loader'
        }
      ]
    }
  }
]
