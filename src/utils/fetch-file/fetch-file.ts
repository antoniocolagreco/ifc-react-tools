import { isRunningInBrowser } from '..'

type FetchFileFunctionType = (
	url: string,
	onDone: (file: Uint8Array) => void,
	onProgress: (event: ProgressEvent) => void,
	onError: (error: Error) => void,
	wasm?: { path: string; absolute: boolean },
) => Promise<void>

const fetchFile: FetchFileFunctionType = async (url: string, onDone, onProgress, onError): Promise<void> => {
	try {
		const chunks: Uint8Array[] = []
		let loaded = 0

		if (isRunningInBrowser()) {
			const response = await fetch(url)
			if (!response.ok) {
				throw new Error(`File not found at "${url}"`)
			}

			let total = -1
			const contentLength = response.headers.get('Content-Length')
			if (contentLength) {
				total = Number.parseInt(contentLength, 10)
			}

			const reader = response.body?.getReader()

			while (true) {
				if (!reader) {
					throw new Error('Response body is missing')
				}
				const { done, value } = await reader.read()
				if (done) break

				chunks.push(value)
				loaded += value.length
				onProgress(new ProgressEvent('progress', { loaded, total }))
			}
		} else {
			const fs = await import('node:fs')
			const stats = fs.statSync(url)
			const total = stats.size

			const stream = fs.createReadStream(url, { highWaterMark: 64 * 1024 })

			for await (const streamChunk of stream) {
				const chunk = streamChunk as Uint8Array
				chunks.push(chunk)
				loaded += chunk.length
				onProgress(new ProgressEvent('progress', { loaded, total }))
			}
		}
		const fileBuffer = new Uint8Array(loaded)
		let position = 0
		for (const chunk of chunks) {
			fileBuffer.set(chunk, position)
			position += chunk.length
		}

		onDone(fileBuffer)
	} catch (error: unknown) {
		console.error('Error fetching file', error)
		onError(error as Error)
	}
}

export { fetchFile }
