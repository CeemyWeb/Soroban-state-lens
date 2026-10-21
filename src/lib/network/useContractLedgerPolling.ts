import { useEffect } from 'react'
import { startLedgerHeadPoll } from './ledgerPoller'

interface UseContractLedgerPollingParams {
  contractId: string
  keys: Array<string>
  rpcUrl: string
  refreshActiveKeys: () => Promise<void>
}

export function useContractLedgerPolling({
  contractId,
  keys,
  rpcUrl,
  refreshActiveKeys,
}: UseContractLedgerPollingParams): void {
  useEffect(() => {
    let hasObservedInitialLedger = false
    const stop = startLedgerHeadPoll({
      rpcConfig: { url: rpcUrl, timeout: 10000 },
      onLedgerChange: () => {
        if (!hasObservedInitialLedger) {
          hasObservedInitialLedger = true
          return
        }

        if (keys.length > 0) {
          void refreshActiveKeys()
        }
      },
    })

    return stop
  }, [contractId, keys, refreshActiveKeys, rpcUrl])
}
