type IfcStep = 'idle' | 'fetching' | 'loading' | 'done'

type IfcProgressEventType = 'progress' | 'done' | 'error'

class IfcProgressEvent extends ProgressEvent {
	step: IfcStep | undefined = undefined
	override type: IfcProgressEventType

	constructor(type: IfcProgressEventType = 'progress', step: IfcStep = 'idle', eventInitDict?: ProgressEventInit) {
		super(type, eventInitDict)
		this.step = step
		this.type = type
	}
}

export { IfcProgressEvent }
