import { Box3, Vector3, type Object3D } from 'three'

const centerObject = (object: Object3D, axes = 'xz'): void => {
	const box = new Box3()
	box.setFromObject(object)
	const center = new Vector3()
	box.getCenter(center)
	const offset = center.negate()

	const allignX = axes.includes('x')
	const allignY = axes.includes('y')
	const allignZ = axes.includes('z')

	if (!allignX) offset.x = 0
	if (!allignY) offset.y = 0
	if (!allignZ) offset.z = 0

	object.position.add(offset)
}

export { centerObject }
