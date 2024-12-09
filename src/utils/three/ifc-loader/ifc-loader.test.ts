import type IfcModel from '@/classes/ifc-model'
import { IfcProgressEvent } from '@/classes/ifc-progress-event'
import path from 'node:path'
import { Group } from 'three'
import { describe, expect, it } from 'vitest'
import { loadIfcFile } from './ifc-loader'

describe('load-ifc', () => {
	it('should load the file', async () => {
		const url = path.resolve('public/test/', 'castle.ifc')
		let lastEvent: IfcProgressEvent = new IfcProgressEvent()

		await loadIfcFile(
			url,
			() => {},
			event => {
				// console.log(event.step, event.type, event.loaded, event.total)
				lastEvent = event
			},
			error => {
				throw error
			},
		)

		expect(lastEvent.type).toBe('done')
	})
	it('should load a valid 3d model', async () => {
		const url = path.resolve('public/test/', 'castle.ifc')
		let loadedModel: IfcModel | undefined

		await loadIfcFile(
			url,
			model => {
				loadedModel = model
			},
			() => {},
			error => {
				throw error
			},
		)

		expect(loadedModel).toBeInstanceOf(Group)
	})
})
