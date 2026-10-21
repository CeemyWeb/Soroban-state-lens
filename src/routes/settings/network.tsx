import { createFileRoute } from '@tanstack/react-router'
import { Copy } from 'lucide-react'
import { useState } from 'react'
import {
  DEFAULT_NETWORKS,
  useLensStore,
  useNetworkConfig,
} from '../../store/lensStore'
import { ConnectionStatus } from '../../store/types'
import { normalizeRpcUrl } from '../../lib/validation/normalizeRpcUrl'

export const Route = createFileRoute('/settings/network')({
  component: SettingsNetwork,
})

export function SettingsNetwork() {
  const networkConfig = useNetworkConfig()
  const connectionStatus = useLensStore((state) => state.connectionStatus)
  const lastCustomUrl = useLensStore((state) => state.lastCustomUrl)
  const [copyStatus, setCopyStatus] = useState('')

  const isCustomNetwork = !Object.values(DEFAULT_NETWORKS).some(
    (network) => network.networkId === networkConfig.networkId,
  )
  const displayedRpcUrl =
    normalizeRpcUrl(networkConfig.rpcUrl) ||
    networkConfig.rpcUrl.trim() ||
    'Not configured'

  const copyValue = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopyStatus(`Copied ${label}`)
    } catch {
      setCopyStatus(`Unable to copy ${label}`)
    }
  }

  const getConnectionStatusColor = (status: ConnectionStatus) => {
    switch (status) {
      case ConnectionStatus.SUCCESS:
        return 'text-green-500'
      case ConnectionStatus.ERROR:
        return 'text-red-500'
      case ConnectionStatus.LOADING:
        return 'text-yellow-500'
      default:
        return 'text-gray-500'
    }
  }

  const getConnectionStatusText = (status: ConnectionStatus) => {
    switch (status) {
      case ConnectionStatus.SUCCESS:
        return 'Connected'
      case ConnectionStatus.ERROR:
        return 'Connection Failed'
      case ConnectionStatus.LOADING:
        return 'Connecting...'
      default:
        return 'Not Connected'
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-2">Network Settings</h1>
        <p className="text-gray-400">
          View and manage your network configuration settings
        </p>
      </div>

      <div className="space-y-6">
        {/* Current Network Configuration */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">
            Current Network Configuration
          </h2>

          <div className="space-y-4">
            {/* Network Type */}
            <div className="flex justify-between items-center py-3 border-b border-gray-700">
              <span className="text-gray-300">Network Type</span>
              <span className="text-white font-medium">
                {isCustomNetwork ? 'Custom RPC' : 'Preset Network'}
              </span>
            </div>

            {/* Network ID */}
            <div className="flex justify-between items-center py-3 border-b border-gray-700">
              <span className="text-gray-300">Network ID</span>
              <span className="text-white font-medium">
                {networkConfig.networkId}
              </span>
            </div>

            {/* RPC URL */}
            <div className="flex justify-between items-center py-3 border-b border-gray-700">
              <span className="text-gray-300">RPC URL</span>
              <div className="flex min-w-0 items-center gap-2">
                <span className="break-all text-right text-white font-mono text-sm">
                  {displayedRpcUrl}
                </span>
                <button
                  type="button"
                  onClick={() => copyValue(displayedRpcUrl, 'RPC URL')}
                  disabled={displayedRpcUrl === 'Not configured'}
                  aria-label="Copy RPC URL"
                  title="Copy RPC URL"
                  className="shrink-0 text-gray-300 hover:text-white disabled:opacity-50"
                >
                  <Copy size={16} aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Horizon URL (if available) */}
            {networkConfig.horizonUrl && (
              <div className="flex justify-between items-center py-3 border-b border-gray-700">
                <span className="text-gray-300">Horizon URL</span>
                <span className="text-white font-mono text-sm">
                  {networkConfig.horizonUrl}
                </span>
              </div>
            )}

            {/* Network Passphrase */}
            <div className="flex justify-between items-start py-3 border-b border-gray-700">
              <span className="text-gray-300">Network Passphrase</span>
              <div className="flex min-w-0 items-start gap-2">
                <span className="text-white font-mono text-sm text-right max-w-md break-all">
                  {networkConfig.networkPassphrase || 'Not configured'}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    copyValue(
                      networkConfig.networkPassphrase,
                      'network passphrase',
                    )
                  }
                  disabled={!networkConfig.networkPassphrase}
                  aria-label="Copy network passphrase"
                  title="Copy network passphrase"
                  className="shrink-0 text-gray-300 hover:text-white disabled:opacity-50"
                >
                  <Copy size={16} aria-hidden="true" />
                </button>
              </div>
            </div>

            {copyStatus && (
              <p role="status" className="text-sm text-gray-300">
                {copyStatus}
              </p>
            )}

            {/* Connection Status */}
            <div className="flex justify-between items-center py-3">
              <span className="text-gray-300">Connection Status</span>
              <span
                className={`font-medium ${getConnectionStatusColor(connectionStatus)}`}
              >
                {getConnectionStatusText(connectionStatus)}
              </span>
            </div>
          </div>
        </div>

        {/* Last Custom URL (if available) */}
        {lastCustomUrl && (
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-white mb-4">
              Last Custom RPC URL
            </h2>
            <div className="flex justify-between items-center py-3">
              <span className="text-gray-300">URL</span>
              <span className="text-white font-mono text-sm">
                {lastCustomUrl}
              </span>
            </div>
          </div>
        )}

        {/* Available Preset Networks */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">
            Available Preset Networks
          </h2>
          <div className="space-y-3">
            {Object.entries(DEFAULT_NETWORKS).map(([key, network]) => (
              <div
                key={key}
                className={`p-3 rounded border ${
                  network.networkId === networkConfig.networkId
                    ? 'bg-blue-900 border-blue-500'
                    : 'bg-gray-700 border-gray-600'
                }`}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <div className="text-white font-medium capitalize">
                      {key}
                    </div>
                    <div className="text-gray-400 text-sm">
                      {normalizeRpcUrl(network.rpcUrl) || network.rpcUrl}
                    </div>
                  </div>
                  {network.networkId === networkConfig.networkId && (
                    <span className="text-blue-400 text-sm font-medium">
                      Active
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
