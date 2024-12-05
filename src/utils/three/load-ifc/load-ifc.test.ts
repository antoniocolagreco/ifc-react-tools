import { IfcProgressEvent } from '@/classes/ifc-progress-event'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadIfc } from './load-ifc'

describe('load-ifc', () => {
	it('should load the 3d model', async () => {
		const url = path.resolve('public/test/', 'castle.ifc')
		let lastEvent: IfcProgressEvent = new IfcProgressEvent()

		await loadIfc(
			url,
			() => {},
			event => {
				console.log(event.step, event.type, event.loaded, event.total)
				lastEvent = event
			},
			error => {
				console.error(error)
			},
		)

		expect(lastEvent.type).toBe('done')
	})
})
