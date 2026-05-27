const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const projectRoot = __dirname
const monorepoRoot = path.resolve(projectRoot, '..')

const config = getDefaultConfig(projectRoot)

// 1. Watch all files in the monorepo (so changes in packages/shared trigger hot reload)
config.watchFolders = [monorepoRoot]

// 2. Tell Metro where to find node_modules (workspace hoists them to the root)
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
]

// 3. Make sure @groupchat/shared resolves to the source files
config.resolver.disableHierarchicalLookup = false

module.exports = config


