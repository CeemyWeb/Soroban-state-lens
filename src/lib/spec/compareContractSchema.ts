import type {
  ContractSchemaField,
  ContractSchemaMismatch,
} from '../../store/types'

/** Return stable diagnostics for fields whose expected and actual types differ. */
export function compareContractSchema(
  expectedFields: Array<ContractSchemaField>,
  actualFields: Array<ContractSchemaField>,
): Array<ContractSchemaMismatch> {
  const expected = new Map(
    expectedFields.map(({ keyPath, type }) => [keyPath, type]),
  )
  const actual = new Map(
    actualFields.map(({ keyPath, type }) => [keyPath, type]),
  )
  const keyPaths = new Set([...expected.keys(), ...actual.keys()])

  return [...keyPaths].sort().flatMap((keyPath) => {
    const expectedType = expected.get(keyPath) ?? '<missing>'
    const actualType = actual.get(keyPath) ?? '<missing>'
    return expectedType === actualType
      ? []
      : [{ keyPath, expectedType, actualType }]
  })
}
