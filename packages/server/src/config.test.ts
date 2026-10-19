import { describe, expect, test } from 'vitest'
import { listenConfig, portFromEnv } from './config.ts'

describe('listenConfig', () => {
  test('binds 127.0.0.1 with the env port', () => {
    expect(listenConfig({ POD_BOARD_API_PORT: '3010' })).toEqual({ hostname: '127.0.0.1', port: 3010 })
    expect(listenConfig({ POD_BOARD_API_PORT: '1' })).toEqual({ hostname: '127.0.0.1', port: 1 })
    expect(listenConfig({ POD_BOARD_API_PORT: '65535' })).toEqual({ hostname: '127.0.0.1', port: 65535 })
    // Other env vars never move the bind address.
    expect(listenConfig({ POD_BOARD_API_PORT: '3010', HOST: '0.0.0.0', HOSTNAME: '0.0.0.0' }).hostname).toBe(
      '127.0.0.1',
    )
  })

  test('defaults to port 3000', () => {
    expect(listenConfig({})).toEqual({ hostname: '127.0.0.1', port: 3000 })
    // An empty value (`POD_BOARD_API_PORT=`) counts as unset.
    expect(listenConfig({ POD_BOARD_API_PORT: '' })).toEqual({ hostname: '127.0.0.1', port: 3000 })
  })

  test('rejects an invalid port', () => {
    for (const bad of ['0', '65536', 'abc', '-1', '3000.5', '1e3', '0x10', ' 3000', '3000abc', '99999999999']) {
      expect(() => listenConfig({ POD_BOARD_API_PORT: bad }), bad).toThrowError(/POD_BOARD_API_PORT/)
    }
    expect(() => listenConfig({ POD_BOARD_API_PORT: 'abc' })).toThrowError(/"abc"/)
    expect(() => listenConfig({ POD_BOARD_API_PORT: '0' })).toThrowError(/1 to 65535/)
  })
})

describe('portFromEnv', () => {
  test('reads any named variable with its own default', () => {
    expect(portFromEnv({ POD_BOARD_WEB_PORT: '3011' }, 'POD_BOARD_WEB_PORT', 3001)).toBe(3011)
    expect(portFromEnv({}, 'POD_BOARD_WEB_PORT', 3001)).toBe(3001)
    expect(() => portFromEnv({ POD_BOARD_WEB_PORT: 'x' }, 'POD_BOARD_WEB_PORT', 3001)).toThrowError(
      /POD_BOARD_WEB_PORT/,
    )
  })
})
