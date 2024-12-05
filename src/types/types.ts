import {
    type BufferGeometry,
    type Group,
    type Mesh,
    type MeshLambertMaterial,
    type Object3D,
    type Scene,
    type ShaderMaterial,
} from 'three'

type ExpressId = number

type NodeData = {
    expressId: ExpressId
    type: string
    name?: string | undefined
    properties?: PropertySet[] | undefined
    selectable?: boolean | undefined
    alwaysVisible?: boolean | undefined
    relatives?: NodeData[] | undefined
    values?: NodeValue | undefined
}

type LambertMesh = Mesh<BufferGeometry, MeshLambertMaterial | ShaderMaterial>

type IfcObject = Omit<Object3D, 'userData'> & { userData: NodeData }
type IfcMesh = Omit<LambertMesh, 'userData'> & { userData: NodeData }
type IfcGroup = Omit<Group, 'userData'> & { userData: NodeData }
type IfcScene = Omit<Scene, 'userData'> & { userData: NodeData }

type PropertyValue = string | number | number[] | boolean | undefined

type NodeValue = Record<string, PropertyValue>

type Property = { name: string; value?: PropertyValue }
type PropertySet = {
    name: string | undefined
    properties: Property[]
}

type Requirements = { requiredType?: string; requiredProperties?: Property[] }
type SelectableRequirements = Requirements & {
    relativeRequirements?: RelativeRequirements[]
    propertiesToReturn?: string[]
}
type MarkableRequirements = Requirements & { propertyToUseAsMarkerId: string }
type RelativeRequirements = Requirements & { sharedPropertyNames?: string[]; propertiesToReturn?: string[] }

type GeometryId = string
type MaterialId = string

type MeshToBuild = { geometryID: GeometryId; materialIDs: MaterialId[] }
type MeshesToBuild = {
    meshes: Map<ExpressId, MeshToBuild>
    geometries: Map<GeometryId, BufferGeometry>
    materials: Map<MaterialId, MeshLambertMaterial>
}

export type {
    ExpressId,
    GeometryId,
    IfcGroup,
    IfcMesh,
    IfcObject,
    IfcScene,
    LambertMesh,
    MarkableRequirements,
    MaterialId,
    MeshesToBuild,
    MeshToBuild,
    NodeData,
    NodeValue,
    Property,
    PropertySet,
    PropertyValue,
    RelativeRequirements,
    Requirements,
    SelectableRequirements,
}
