import { NormalBlending, Sprite, SpriteMaterial, Texture, Vector3 } from 'three'

const generateMarkerMaterial = (color: string | CanvasGradient | CanvasPattern = '#ffffff'): SpriteMaterial => {
	// Crea un elemento canvas
	const canvas = document.createElement('canvas')
	const context = canvas.getContext('2d')
	if (!context) throw new Error('CanvasRenderingContext2D is null')

	// Imposta le dimensioni del canvas
	const size = 128 // Dimensione del canvas in pixel
	const lineWidth = 10 // Spessore della linea
	canvas.width = size + lineWidth * 2
	canvas.height = size + lineWidth * 2

	// Disegna un quadrato arrotondato
	const radius = 20 // Raggio degli angoli arrotondati
	context.beginPath()
	context.moveTo(radius + lineWidth, lineWidth) // Aggiusta la posizione iniziale
	context.lineTo(size - radius + lineWidth, lineWidth)
	context.quadraticCurveTo(size + lineWidth, lineWidth, size + lineWidth, radius + lineWidth)
	context.lineTo(size + lineWidth, size - radius + lineWidth)
	context.quadraticCurveTo(size + lineWidth, size + lineWidth, size - radius + lineWidth, size + lineWidth)
	context.lineTo(radius + lineWidth, size + lineWidth)
	context.quadraticCurveTo(lineWidth, size + lineWidth, lineWidth, size - radius + lineWidth)
	context.lineTo(lineWidth, radius + lineWidth)
	context.quadraticCurveTo(lineWidth, lineWidth, radius + lineWidth, lineWidth)
	context.closePath()

	// Imposta il colore di riempimento e applica il riempimento
	context.strokeStyle = color // Scegli il colore desiderato
	context.lineWidth = lineWidth
	context.stroke()

	// Crea una texture dalla canvas
	const texture = new Texture(canvas)
	texture.needsUpdate = true // Importante per aggiornare la texture con il contenuto del canvas

	// Crea un materiale sprite con la texturedep
	const material = new SpriteMaterial({
		map: texture,
		depthTest: false,
		opacity: 1,
		blending: NormalBlending,
	})
	return material
}

class Marker extends Sprite {
	static type = 'Marker'
	override type = Marker.type
	override userData: { id?: string; position?: { x: number; y: number } } = {}

	static defaultMarkerMaterial = generateMarkerMaterial('#ffffff')
	static successMarkerMaterial = generateMarkerMaterial('#00ff00')
	static warningMarkerMaterial = generateMarkerMaterial('#ffcc00')
	static dangerMarkerMaterial = generateMarkerMaterial('#ff0000')

	constructor(position: Vector3 = new Vector3(0, 0, 0), material = Marker.defaultMarkerMaterial) {
		super(material)
		this.position.copy(position)
	}

	set status(status: 'success' | 'warning' | 'danger') {
		switch (status) {
			case 'success': {
				this.material = Marker.successMarkerMaterial
				break
			}
			case 'warning': {
				this.material = Marker.warningMarkerMaterial
				break
			}
			case 'danger': {
				this.material = Marker.dangerMarkerMaterial
				break
			}
			default: {
				this.material = Marker.defaultMarkerMaterial
			}
		}
	}

	static isMarker(object: unknown): object is Marker {
		return object !== undefined && object !== null && (object as Marker).type === this.type
	}
}
export { Marker }
