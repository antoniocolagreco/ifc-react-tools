type IfcViewerFullscreenState = 'on' | 'off'

type GlobalStateData = {
	commands: {
		lookAt: (expressID?: number) => void
		moveAt: (expressID?: number) => void
		setFullScreen: (state: IfcViewerFullscreenState) => void
		resetView: () => void
	}
}

type GlobalState = {
	currentState: GlobalStateData
	listeners: VoidFunction[]

	setState: (state: Partial<GlobalStateData>) => void
	getState: () => GlobalStateData

	subscribe: (fn: VoidFunction) => VoidFunction

	notify: VoidFunction
}

const globalState: GlobalState = {
	currentState: {
		commands: {
			lookAt: () => {},
			moveAt: () => {},
			setFullScreen: () => {},
			resetView: () => {},
		},
	},
	listeners: [],

	setState: newState => {
		globalState.currentState = { ...globalState.currentState, ...newState }
		globalState.notify()
	},

	getState: () => globalState.currentState,

	subscribe: (fn: VoidFunction) => {
		globalState.listeners.push(fn)
		return () => {
			globalState.listeners = globalState.listeners.filter(listener => listener !== fn)
		}
	},

	notify: () => {
		for (const listener of globalState.listeners) {
			listener()
		}
	},
}

export { globalState, type GlobalStateData as GlobalState }