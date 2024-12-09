import { type BufferGeometry, type Mesh, type MeshLambertMaterial, type ShaderMaterial } from 'three'

type ExpressId = number

type IfcItemUserData = {
	expressId: ExpressId
	type?: string
	name?: string | undefined
	properties?: PropertySet[] | undefined
	links?: IfcLink
	selectable?: boolean | undefined
	alwaysVisible?: boolean | undefined
	anchorable?: boolean | undefined
}

type IfcData = IfcItemUserData[]

type IfcModelUserData = {
	geometriesMap: Map<GeometryId, BufferGeometry>
	materialsMap: Map<MaterialId, MeshLambertMaterial>
	hoverMaterialsMap: Map<MaterialId, MeshLambertMaterial>
	selectMaterialsMap: Map<MaterialId, MeshLambertMaterial>
}

type IfcMeshUserData = {
	geometryId: GeometryId
	materialId: MaterialId
	hoverMaterialId?: MaterialId
	selectMaterialId?: MaterialId
}

type IfcLink = Record<string, ExpressId[]>

type LambertMesh = Mesh<BufferGeometry, MeshLambertMaterial>

type ShaderMesh = Mesh<BufferGeometry, ShaderMaterial>

type PropertyValue = string | number | number[] | boolean | undefined

type NodeValue = Record<string, PropertyValue>

type Property = { name: string; value?: PropertyValue }

type PropertySet = {
	name: string | undefined
	properties: Property[]
}

type Requirements = { requiredType?: string; requiredProperties?: Property[] }

type SelectableRequirements = Requirements & { linkRequirements?: LinkRequirements }
type LinkRequirements = Requirements & { linkPropertyName: string }

type GeometryId = string
type MaterialId = string

export type {
	ExpressId,
	GeometryId,
	IfcData,
	IfcItemUserData,
	IfcLink,
	IfcMeshUserData,
	IfcModelUserData,
	LambertMesh,
	LinkRequirements,
	MaterialId,
	NodeValue,
	Property,
	PropertySet,
	PropertyValue,
	Requirements,
	SelectableRequirements,
	ShaderMesh,
}
