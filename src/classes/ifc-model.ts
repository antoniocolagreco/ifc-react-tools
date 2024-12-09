import type { GeometryId, IfcModelUserData, MaterialId } from '@/types/types'
import { Group, type BufferGeometry, type MeshLambertMaterial } from 'three'
import type IfcItem from './ifc-item'
import type IfcMesh from './ifc-mesh'

class IfcModel extends Group {
	override children: IfcItem[] = []
	override userData: IfcModelUserData = {
		geometriesMap: new Map<GeometryId, BufferGeometry>(),
		materialsMap: new Map<MaterialId, MeshLambertMaterial>(),
		hoverMaterialsMap: new Map<MaterialId, MeshLambertMaterial>(),
		selectMaterialsMap: new Map<MaterialId, MeshLambertMaterial>(),
	}

	getItemGeometry = (geometryId: GeometryId): BufferGeometry | undefined => {
		return this.userData.geometriesMap.get(geometryId)
	}

	setItemGeometry = (geometryId: GeometryId, geometry: BufferGeometry): void => {
		this.userData.geometriesMap.set(geometryId, geometry)
	}

	getItemMaterial = (materialId: MaterialId): MeshLambertMaterial | undefined => {
		return this.userData.materialsMap.get(materialId)
	}

	setItemMaterial = (materialId: MaterialId, material: MeshLambertMaterial): void => {
		this.userData.materialsMap.set(materialId, material)
	}

	getHoverMaterial = (materialId: MaterialId): MeshLambertMaterial | undefined => {
		return this.userData.hoverMaterialsMap.get(materialId)
	}

	setHoverMaterial = (materialId: MaterialId, material: MeshLambertMaterial): void => {
		this.userData.hoverMaterialsMap.set(materialId, material)
	}

	getSelectMaterial = (materialId: MaterialId): MeshLambertMaterial | undefined => {
		return this.userData.selectMaterialsMap.get(materialId)
	}

	setSelectMaterial = (materialId: MaterialId, material: MeshLambertMaterial): void => {
		this.userData.selectMaterialsMap.set(materialId, material)
	}

	getIfcItem = (expressId: number): IfcItem | undefined => {
		return this.children.find(ifcItem => ifcItem.userData.expressId === expressId)
	}

	getSeletableIfcItems = (): IfcItem[] => {
		return this.children.filter(ifcItem => ifcItem.isSelectable())
	}

	getAlwaysVisibleIfcItems = (): IfcItem[] => {
		return this.children.filter(ifcItem => ifcItem.isAlwaysVisible())
	}

	getAllMeshes = (): IfcMesh[] => {
		return this.children.flatMap(ifcItem => ifcItem.children)
	}
}

export default IfcModel
