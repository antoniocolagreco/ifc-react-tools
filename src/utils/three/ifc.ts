import {
	Box3,
	BufferAttribute,
	BufferGeometry,
	Color,
	Group,
	InstancedMesh,
	Matrix4,
	Mesh,
	MeshLambertMaterial,
	Object3D,
	Scene,
	Sphere,
	SphereGeometry,
	type Camera,
	type PerspectiveCamera,
	type Vector3,
} from 'three'
import type { OrbitControls } from 'three/examples/jsm/Addons.js'
import { DEG2RAD } from 'three/src/math/MathUtils.js'
import { IFC2X3, IFCRELDEFINESBYPROPERTIES, type FlatMesh, type Handle, type IFC4X3, type IfcAPI } from 'web-ifc'
import type {
	GeometryId,
	IfcGroup,
	IfcMesh,
	IfcObject,
	LambertMesh,
	MaterialId,
	NodeData,
	Property,
	PropertySet,
	PropertyValue,
	RelativeRequirements,
	Requirements,
	SelectableRequirements,
} from '../../types/types'

const isIfcMesh = (object: Object3D | null | undefined): object is IfcMesh =>
	isLambertMesh(object) &&
	object.material instanceof MeshLambertMaterial &&
	'expressId' in object.userData &&
	object.userData['expressId'] !== undefined

const isIfcGroup = (object: Object3D | null | undefined): object is IfcGroup =>
	isGroup(object) && 'expressId' in object.userData && object.userData['expressId'] !== undefined

const isIfcObject = (object: Object3D | null | undefined): object is IfcObject =>
	object instanceof Object3D && object.userData['expressId'] !== undefined

const isLambertMesh = (object: Object3D | null | undefined): object is LambertMesh =>
	isMesh(object) && object.material instanceof MeshLambertMaterial

const isMesh = (object: Object3D | null | undefined): object is Mesh => object instanceof Mesh

const isInstancedMesh = (object: Object3D | null | undefined): object is InstancedMesh =>
	object instanceof InstancedMesh

const isGroup = (object: Object3D | null | undefined): object is Group => object instanceof Group

const isScene = (object: Object3D | null | undefined): object is Scene => object instanceof Scene

const createBoundingSphereMesh = (sphere: Sphere): LambertMesh => {
	const sphereGeometry = new SphereGeometry(sphere.radius)
	const sphereMaterial = new MeshLambertMaterial({
		transparent: true,
		opacity: 0.5,
		emissive: 0x00498a,
	})
	const mesh = new Mesh(sphereGeometry, sphereMaterial)
	mesh.position.copy(sphere.center)
	return mesh
}

const createBoundingSphere = (object: Object3D | Object3D[]): Sphere => {
	const meshes = Array.isArray(object) ? object : [object]
	const bb = new Box3()
	for (const mesh of meshes) {
		bb.expandByObject(mesh)
	}
	const sphere = new Sphere()
	bb.getBoundingSphere(sphere)
	return sphere
}

const findMinimumDistanceForBoundingSphere = (sphere: Sphere, camera: PerspectiveCamera): number => {
	const vFOV = camera.getEffectiveFOV() * DEG2RAD
	const hFOV = Math.atan(Math.tan(vFOV * 0.5) * camera.aspect) * 2
	const fov = camera.aspect > 1 ? vFOV : hFOV
	return sphere.radius / Math.sin(fov * 0.5)
}

const fitBoundingSphere = (
	sphere: Sphere,
	camera: PerspectiveCamera,
	controls: OrbitControls,
	margin = 1.1,
	minDistance = 1,
): void => {
	const distance = findMinimumDistanceForBoundingSphere(sphere, camera)
	const finalDistance = Math.max(distance, minDistance) * margin
	const cameraPosition = camera.position
	const direction = sphere.center.clone().sub(cameraPosition).normalize()
	const distanceVector = direction.multiplyScalar(-finalDistance)
	const newCoordinates = sphere.center.clone().add(distanceVector)
	camera.position.copy(newCoordinates)
	controls.target.copy(sphere.center)
	controls.update()
}

const moveTo = (destination: Vector3, camera: Camera, controls: OrbitControls, distance: number): void => {
	const cameraPosition = camera.position
	const direction = destination.clone().sub(cameraPosition).normalize()
	const distanceVector = direction.multiplyScalar(-distance)
	const newCoordinates = destination.clone().add(distanceVector)
	camera.position.copy(newCoordinates)
	controls.target.copy(destination)
	controls.update()
}

const disposeMaterial = (material: MeshLambertMaterial): void => {
	if (material.map) material.map.dispose()
	if (material.lightMap) material.lightMap.dispose()
	if (material.aoMap) material.aoMap.dispose()
	if (material.emissiveMap) material.emissiveMap.dispose()
	if (material.bumpMap) material.bumpMap.dispose()
	if (material.normalMap) material.normalMap.dispose()
	if (material.specularMap) material.specularMap.dispose()
	if (material.envMap) material.envMap.dispose()
	if (material.alphaMap) material.alphaMap.dispose()
	material.dispose()
}

const disposeObjects = (object3D: Object3D | undefined): void => {
	if (!object3D) return

	if (isMesh(object3D)) {
		object3D.geometry.dispose()
		const material = object3D.material as MeshLambertMaterial | MeshLambertMaterial[]
		if (Array.isArray(material)) {
			for (const mat of material) {
				disposeMaterial(mat)
			}
		} else {
			disposeMaterial(material)
		}
	}

	while (object3D.children.length > 0) {
		disposeObjects(object3D.children[0])
		if (object3D.children[0]) {
			object3D.remove(object3D.children[0])
		}
	}
}

const getAllMeshesByExpressId = (object: Object3D, expressId: number): LambertMesh[] => {
	const meshes: LambertMesh[] = []
	object.traverse(child => {
		if (child.userData['expressId'] === expressId) {
			if (isIfcMesh(child)) {
				meshes.push(child)
			}
			if (isIfcGroup(child)) {
				meshes.push(...(child.children as LambertMesh[]))
			}
		}
	})
	return meshes
}

const getIfcNodeProperties = (ifcAPI: IfcAPI, modelID: number, expressId: number, deep = false): NodeData => {
	const data = ifcAPI.GetLine(modelID, expressId, true, true) as IFC2X3.IfcBuildingElement
	const type = ifcAPI.GetNameFromTypeCode(data.type)

	const relations: (IFC2X3.IfcRelDefinesByProperties | IFC2X3.IfcRelDefinesByType)[] = []

	if (data.IsDefinedBy) {
		relations.push(...(data.IsDefinedBy as (IFC2X3.IfcRelDefinesByProperties | IFC2X3.IfcRelDefinesByType)[]))
	}

	const nodeProperties: PropertySet[] = []
	for (const relation of relations) {
		// if (relation.type === IFCRELDEFINESBYTYPE) {
		// const relationDefinesByType = relation as IFC2X3.IfcRelDefinesByType
		// const handle = relationDefinesByType.RelatingType as Handle<IFC2X3.IfcTypeObject>
		// const typeObjectLine = ifcAPI.GetLine(modelID, handle.value, true, true) as IFC2X3.IfcTypeObject
		// const typeName = typeObjectLine.Name?.value
		// categories.push(typeName)
		// }
		if (relation.type === IFCRELDEFINESBYPROPERTIES) {
			const relationDefinesByProperties = relation as IFC2X3.IfcRelDefinesByProperties
			const handle = relationDefinesByProperties.RelatingPropertyDefinition as Handle<IFC2X3.IfcPropertySet>
			const propertySetLine = ifcAPI.GetLine(modelID, handle.value, true, deep) as
				| IFC2X3.IfcPropertySet
				| IFC4X3.IfcProfileDef

			if (!(propertySetLine instanceof IFC2X3.IfcPropertySet)) continue

			const properties = []
			for (const prop of propertySetLine.HasProperties) {
				const propertySigleValue = prop as IFC2X3.IfcPropertySingleValue
				const property = {
					name: propertySigleValue.Name.value,
					value: propertySigleValue.NominalValue?.value,
				}
				properties.push(property)
			}

			const propertySet = { name: propertySetLine.Name?.value, properties }
			nodeProperties.push(propertySet)
		}
	}

	return {
		expressId,
		type,
		name: data.Name?.value ?? '',
		properties: nodeProperties,
	}
}

const setIfcUserData = (
	ifcAPI: IfcAPI,
	modelID: number,
	expressId: number,
	mesh: IfcMesh | IfcGroup,
	deep = false,
): void => {
	const { name, properties, type } = getIfcNodeProperties(ifcAPI, modelID, expressId, deep)

	mesh.userData.expressId = expressId
	mesh.userData.type = type
	mesh.userData.name = name
	mesh.name = name ?? ''
	mesh.userData.properties = properties
}

const generateMeshFromGeometry = (ifcAPI: IfcAPI, modelID: number, flatMesh: FlatMesh): Object3D => {
	const placedGeometries = flatMesh.geometries

	const meshes: Mesh[] = []

	for (let index = 0; index < placedGeometries.size(); index++) {
		const placedGeometry = flatMesh.geometries.get(index)
		const geometry = getBufferGeometry(ifcAPI, modelID, placedGeometry.geometryExpressID)

		const ifgColor = placedGeometry.color
		const color = new Color(ifgColor.x, ifgColor.y, ifgColor.z)

		const opacity = ifgColor.w === 1 ? 1 : 0.5
		const transparent = opacity !== 1
		const material = new MeshLambertMaterial({ color, transparent, opacity })
		if (transparent) {
			material.polygonOffset = true
			material.polygonOffsetFactor = 1
			material.polygonOffsetUnits = 10
		}

		const mesh = new Mesh(geometry, material)
		const matrix = new Matrix4()
		matrix.fromArray(placedGeometry.flatTransformation)
		mesh.matrix = matrix
		mesh.matrixAutoUpdate = false
		meshes.push(mesh)
	}

	const result = meshes.length === 1 ? (meshes[0] as IfcMesh) : (new Group().add(...meshes) as IfcGroup)

	result.userData.expressId = flatMesh.expressID

	return result
}

const buildMesh = (
	ifcAPI: IfcAPI,
	modelID: number,
	flatMesh: FlatMesh,
	geometriesMap: Map<GeometryId, BufferGeometry>,
	materialsMap: Map<MaterialId, MeshLambertMaterial | MeshLambertMaterial[]>,
): IfcMesh | IfcGroup => {
	const { geometries, expressID } = flatMesh

	const meshes: LambertMesh[] = []

	for (let index = 0; index < geometries.size(); index++) {
		const {
			color: { w, x, y, z },
			flatTransformation,
			geometryExpressID,
		} = flatMesh.geometries.get(index)
		const transparent = w !== 1
		const opacity = 0.5

		// Create a unique id for the geometry taking into account if it is transparent or opaque
		const geometryID: GeometryId = transparent
			? `${geometryExpressID.toString()}T`
			: `${geometryExpressID.toString()}O`

		let geometry = geometriesMap.get(geometryID)

		// If geometryRecord is not found, create a new one
		if (!geometry) {
			geometry = getBufferGeometry(ifcAPI, modelID, geometryExpressID)
		}
		const matrix = new Matrix4()
		matrix.fromArray(flatTransformation)
		geometry.applyMatrix4(matrix)

		const color = new Color(x, y, z)
		const materialID = `${x.toString()}-${y.toString()}-${z.toString()}-${w.toString()}`
		let material = materialsMap.get(materialID)

		if (!material) {
			material = new MeshLambertMaterial({ color, transparent, opacity })
			if (transparent) {
				material.polygonOffset = true
				material.polygonOffsetFactor = -1
				material.polygonOffsetUnits = -1
				material.depthWrite = false
			}
			materialsMap.set(materialID, material)
		}

		const mesh = new Mesh(geometry, material) as LambertMesh
		mesh.matrixAutoUpdate = false

		meshes.push(mesh)
	}

	if (meshes.length === 1) {
		const ifcMesh = meshes[0] as IfcMesh
		ifcMesh.userData.expressId = expressID
		return ifcMesh
	}

	const ifcGroup = new Group() as IfcGroup
	ifcGroup.add(...meshes)
	ifcGroup.userData.expressId = expressID

	return ifcGroup
}

const findPropertyValueFromIfcMesh = (mesh: IfcObject, propertyName: string): Property['value'] | undefined => {
	if (!mesh.userData.properties) return undefined

	for (const propertySet of mesh.userData.properties) {
		for (const property of propertySet.properties) {
			if (property.name.toLocaleLowerCase() === propertyName.toLocaleLowerCase()) return property.value
		}
	}

	return undefined
}

const getBufferGeometry = (ifcAPI: IfcAPI, modelID: number, geometryExpressID: number): BufferGeometry => {
	const geometry = ifcAPI.GetGeometry(modelID, geometryExpressID)
	const verts = ifcAPI.GetVertexArray(geometry.GetVertexData(), geometry.GetVertexDataSize())
	const indices = ifcAPI.GetIndexArray(geometry.GetIndexData(), geometry.GetIndexDataSize())
	const bufferGeometry = convertGeometryToBuffer(verts, indices)
	geometry.delete()
	return bufferGeometry
}

const convertGeometryToBuffer = (vertexData: Float32Array, indexData: Uint32Array): BufferGeometry => {
	const geometry = new BufferGeometry()

	const posFloats = new Float32Array(vertexData.length / 2)
	const normFloats = new Float32Array(vertexData.length / 2)

	for (let i = 0; i < vertexData.length; i += 6) {
		posFloats[i / 2 + 0] = vertexData[i + 0] ?? 0
		posFloats[i / 2 + 1] = vertexData[i + 1] ?? 0
		posFloats[i / 2 + 2] = vertexData[i + 2] ?? 0

		normFloats[i / 2 + 0] = vertexData[i + 3] ?? 0
		normFloats[i / 2 + 1] = vertexData[i + 4] ?? 0
		normFloats[i / 2 + 2] = vertexData[i + 5] ?? 0
	}

	geometry.setAttribute('position', new BufferAttribute(posFloats, 3))
	geometry.setAttribute('normal', new BufferAttribute(normFloats, 3))
	geometry.setIndex(new BufferAttribute(indexData, 1))
	return geometry
}

const checkSingleProperty = (valueToCheck: PropertyValue, valueToFind: PropertyValue, precise = true): boolean => {
	const normalizedValueToCheck = String(valueToCheck).toLowerCase()
	const normalizedValueToFind = String(valueToFind).toLowerCase()
	if (precise) return normalizedValueToCheck === normalizedValueToFind
	return normalizedValueToCheck.includes(normalizedValueToFind)
}

const checkObjectByPropsAndType = (nodeData: NodeData, propertiesToFind: Property[], type?: string): boolean => {
	// Controlla se l'oggetto ha delle proprietà utente
	if (!nodeData.properties) return false

	// Controlla se il tipo dell'oggetto corrisponde al tipo specificato (se fornito)
	if (type && nodeData.type !== type) return false

	// Itera su ciascuna proprietà da trovare
	for (const propertyToFind of propertiesToFind) {
		// Controlla se l'oggetto ha la proprietà specificata
		const valid = checkObjectBySingleProp(nodeData, propertyToFind)
		if (!valid) return false
	}

	// Se tutte le proprietà corrispondono, ritorna true
	return true
}

const checkObjectBySingleProp = (nodeData: NodeData, propertyToFind: Property): boolean => {
	const nameToFind = propertyToFind.name
	const valueToFind = propertyToFind.value

	if (!nodeData.properties) return false

	// Itera su ciascun set di proprietà nell'oggetto
	for (const propertySet of nodeData.properties) {
		// Itera su ciascuna proprietà nel set di proprietà
		for (const property of propertySet.properties) {
			const propertyValueAsString = String(property.value)

			// Controlla se solo il nome della proprietà corrisponde
			if (!valueToFind && nameToFind && checkSingleProperty(property.name, nameToFind, false)) {
				return true
			}

			// Controlla se solo il valore della proprietà corrisponde
			if (valueToFind && !nameToFind && checkSingleProperty(propertyValueAsString, valueToFind)) {
				return true
			}

			// Controlla se sia il nome che il valore della proprietà corrispondono
			if (
				valueToFind &&
				nameToFind &&
				checkSingleProperty(property.name, nameToFind, false) &&
				checkSingleProperty(propertyValueAsString, valueToFind)
			) {
				return true
			}
		}
	}

	// Se nessuna proprietà corrisponde, ritorna false
	return false
}

const findObjectsByIfcPropAndType = (
	object3D: Object3D | undefined,
	propertiesToFind: Property[],
	type?: string,
): Object3D[] => {
	const foundItems: Object3D[] = []
	if (!object3D) return foundItems

	const stack: Object3D[] = [object3D]

	while (stack.length > 0) {
		const current = stack.pop()
		if (!current) continue
		if (checkObjectByPropsAndType(current.userData as NodeData, propertiesToFind, type)) {
			foundItems.push(current)
		}
		for (const child of current.children) {
			stack.push(child)
		}
	}

	return foundItems
}

const checkIfMeshPropertiesMeetsRequirements = (
	nodeData: NodeData,
	requirements: Requirements | undefined,
): boolean => {
	// Check if there are any selection requirements
	if (!requirements) {
		return true
	}

	// Check if the object is the correct type
	if (requirements.requiredType && nodeData.type !== requirements.requiredType) {
		return false
	}

	// Check if the object has no properties
	if (!requirements.requiredProperties || requirements.requiredProperties.length === 0) {
		return true
	}

	// Check if the object has the required properties
	if (!checkObjectByPropsAndType(nodeData, requirements.requiredProperties)) {
		return false
	}

	return true
}

const findAndSetMeshRelatives = (mesh: IfcObject, scene: Scene, relativeRequirements: RelativeRequirements[]): void => {
	const relatives: Record<string, NodeData> = {}
	for (const relativeRequirement of relativeRequirements) {
		if (!relativeRequirement.sharedPropertyNames) continue

		const propertiesToFind: Property[] = []

		for (const sharedPropertyName of relativeRequirement.sharedPropertyNames) {
			const sharedPropertyValue = findPropertyValueFromIfcMesh(mesh, sharedPropertyName)
			// If the shared property has no value, any comparison can be made, so no relative can be founbd
			if (!sharedPropertyValue) {
				mesh.userData.relatives = []
				return
			}
			propertiesToFind.push({ name: sharedPropertyName, value: sharedPropertyValue })
		}
		if (relativeRequirement.requiredProperties) {
			for (const requiredProperty of relativeRequirement.requiredProperties) {
				propertiesToFind.push(requiredProperty)
			}
		}

		const relativesMeshes = findObjectsByIfcPropAndType(scene, propertiesToFind) as IfcMesh[]
		const filteredRelativeMeshes = relativesMeshes.filter(relativeMesh => !relativeMesh.userData.selectable)

		// Mark relatives as always visible
		for (const relativeMesh of filteredRelativeMeshes) {
			relativeMesh.userData.alwaysVisible = true
		}

		for (const relativeMesh of filteredRelativeMeshes) {
			const relativeValue: NodeData = {
				expressId: relativeMesh.userData.expressId,
				name: relativeMesh.userData.name,
				type: relativeMesh.userData.type,
				values: {},
			}
			if (!relativeRequirement.propertiesToReturn) continue
			for (const propertyToReturn of relativeRequirement.propertiesToReturn) {
				const propertyValue = findPropertyValueFromIfcMesh(relativeMesh, propertyToReturn)
				if (!relativeValue.values) {
					relativeValue.values = {}
				}
				relativeValue.values[propertyToReturn] = propertyValue
			}
			relatives[relativeValue.expressId] = relativeValue
		}
	}
	mesh.userData.relatives = Object.values(relatives)
}

const removeUnusedPropertiesFromUserData = (ifcMeshes: Object3D[] | Object3D | undefined): void => {
	if (!ifcMeshes) return

	const meshes = (Array.isArray(ifcMeshes) ? ifcMeshes : [ifcMeshes]) as IfcMesh[]

	for (const ifcMesh of meshes) {
		const { userData } = ifcMesh
		if (userData.properties) {
			delete userData.properties
		}
		for (const child of ifcMesh.children) {
			removeUnusedPropertiesFromUserData(child as IfcMesh)
		}
	}
}

const generateUserData = (
	ifcObject: IfcObject | undefined,
	scene: Scene | undefined,
	selectablesRequirements: SelectableRequirements[] | undefined,
	alwaysVisibleRequirements: Requirements[] | undefined,
): void => {
	if (!ifcObject) throw new Error('Model not loaded')
	if (!scene) throw new Error('Scene not loaded')

	ifcObject.userData.values = {}

	if (selectablesRequirements) {
		for (const selectableRequirement of selectablesRequirements) {
			if (checkIfMeshPropertiesMeetsRequirements(ifcObject.userData, selectableRequirement)) {
				ifcObject.userData.selectable = true

				// If there are properties to return, they should are added to the mesh userData
				if (selectableRequirement.propertiesToReturn) {
					for (const propertyName of selectableRequirement.propertiesToReturn) {
						const propertyValue = findPropertyValueFromIfcMesh(ifcObject, propertyName)
						ifcObject.userData.values[propertyName] = propertyValue
					}
				}

				// If there are relatives, they should be found and added to the mesh userData
				if (selectableRequirement.relativeRequirements) {
					findAndSetMeshRelatives(ifcObject, scene, selectableRequirement.relativeRequirements)

					// If a mesh has no relatives, it will not be a selectable
					if (ifcObject.userData.relatives?.length === 0) {
						delete ifcObject.userData.selectable
					}
				}
			}
		}
	}

	if (alwaysVisibleRequirements) {
		for (const alwaysVisibleRequirement of alwaysVisibleRequirements) {
			if (checkIfMeshPropertiesMeetsRequirements(ifcObject.userData, alwaysVisibleRequirement)) {
				ifcObject.userData.alwaysVisible = true
			}
		}
	}

	for (const child of ifcObject.children) {
		generateUserData(child as IfcObject, scene, selectablesRequirements, alwaysVisibleRequirements)
	}

	removeUnusedPropertiesFromUserData(ifcObject)
}

const getSelectableMeshes = (
	ifcMeshes: Object3D[] | Object3D | undefined,
	selectableMeshes: IfcMesh[] = [],
): IfcMesh[] => {
	if (!ifcMeshes) return selectableMeshes

	const meshes = (Array.isArray(ifcMeshes) ? ifcMeshes : [ifcMeshes]) as IfcMesh[]

	for (const ifcMesh of meshes) {
		if (ifcMesh.userData.selectable) {
			selectableMeshes.push(ifcMesh)
		}
		if (ifcMesh.children.length > 0) {
			getSelectableMeshes(ifcMesh.children as IfcMesh[], selectableMeshes)
		}
	}
	return selectableMeshes
}

const getMeshesToSave = (ifcMeshes: Object3D[] | Object3D | undefined, meshesToSave: IfcMesh[] = []): IfcMesh[] => {
	if (!ifcMeshes) return meshesToSave

	const meshes = (Array.isArray(ifcMeshes) ? ifcMeshes : [ifcMeshes]) as IfcMesh[]

	for (const ifcMesh of meshes) {
		if (ifcMesh.userData.selectable || ifcMesh.userData.alwaysVisible) {
			meshesToSave.push(ifcMesh)
		}
		if (ifcMesh.children.length > 0) {
			getMeshesToSave(ifcMesh.children as IfcMesh[], meshesToSave)
		}
	}
	return meshesToSave
}

const getDataToSave = (ifcMeshes: IfcObject[]): NodeData[] => {
	const nodes = ifcMeshes.map(ifcMesh => ifcMesh.userData)

	const uniqueNodes = nodes.filter(
		(value, index, self) => self.findIndex(t => t.expressId === value.expressId) === index,
	)

	return uniqueNodes
}

const getRelativeMeshes = (object: Object3D): LambertMesh[] => {
	const meshes: LambertMesh[] = []

	if (isIfcGroup(object)) {
		const children = object.children
		for (const child of children) {
			meshes.push(...getRelativeMeshes(child))
		}
	} else if (isMesh(object)) {
		if (isIfcMesh(object)) {
			return [object]
		}

		const parent = object.parent
		if (!parent) {
			return []
		}

		for (const child of parent.children) {
			if (isMesh(child)) {
				meshes.push(child as LambertMesh)
			}
		}
	}

	return meshes
}

const getMeshExpressId = (object: Object3D): number | undefined => {
	if (isMesh(object)) {
		if (isIfcMesh(object)) {
			return object.userData.expressId
		}
		const parent = object.parent
		if (isIfcGroup(parent)) {
			return parent.userData.expressId
		}
	}
	if (isIfcGroup(object)) {
		return object.userData.expressId
	}
	return undefined
}

const isMeshSelectable = (object: Object3D): boolean => {
	if (isMesh(object)) {
		if (isIfcMesh(object)) {
			return object.userData.selectable ?? false
		}
		const parent = object.parent
		if (isIfcGroup(parent)) {
			return parent.userData.selectable ?? false
		}
	}
	if (isIfcGroup(object)) {
		return object.userData.selectable ?? false
	}
	return false
}

const isMeshAlwaysVisible = (object: Object3D): boolean => {
	if (isMesh(object)) {
		if (isIfcMesh(object)) {
			return object.userData.alwaysVisible ?? false
		}
		const parent = object.parent
		if (isIfcGroup(parent)) {
			return parent.userData.alwaysVisible ?? false
		}
	}
	if (isIfcGroup(object)) {
		return object.userData.alwaysVisible ?? false
	}
	return false
}

export {
	buildMesh,
	checkIfMeshPropertiesMeetsRequirements,
	checkObjectByPropsAndType,
	checkObjectBySingleProp,
	checkSingleProperty,
	createBoundingSphere,
	createBoundingSphereMesh,
	disposeObjects,
	findAndSetMeshRelatives,
	findMinimumDistanceForBoundingSphere,
	findObjectsByIfcPropAndType,
	findPropertyValueFromIfcMesh,
	fitBoundingSphere,
	generateMeshFromGeometry,
	generateUserData,
	getAllMeshesByExpressId,
	getDataToSave,
	getIfcNodeProperties,
	getMeshesToSave,
	getMeshExpressId,
	getRelativeMeshes,
	getSelectableMeshes,
	isGroup,
	isIfcGroup,
	isIfcMesh,
	isIfcObject,
	isInstancedMesh,
	isLambertMesh,
	isMesh,
	isMeshAlwaysVisible,
	isMeshSelectable,
	isScene,
	moveTo,
	removeUnusedPropertiesFromUserData,
	setIfcUserData,
}
