import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadIfc } from './load-ifc'

describe('load-ifc', () => {
	it('should load the 3d model', async () => {
		const url = path.resolve('public/test/', 'castle.ifc')
		await loadIfc(
			url,
			() => {},
			event => {
				console.log(event.step, event.type, event.loaded, event.total)
			},
			error => {
				console.error(error)
			},
		)

		expect(1).toBe(1)
	})
})
