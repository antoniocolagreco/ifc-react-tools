import type IfcModel from '@/classes/ifc-model'
import type { ExpressId, IfcItemUserData } from '@/types/types'

/**
 * Extracts and returns the data to be saved from the given IFC model.
 *
 * This function filters the children of the provided IFC model to include only those
 * that are either always visible or selectable. It then constructs a record where the
 * keys are the `expressId` of each filtered item and the values are the corresponding
 * `IfcItemData`.
 *
 * @param ifcModel - The IFC model from which to extract the data.
 * @returns A record mapping `ExpressId` to `IfcItemData` for the filtered items.
 */
const getDataToSave = (ifcModel: IfcModel): Record<ExpressId, IfcItemUserData> => {
	const meshesToSave = ifcModel.children.filter(ifcItem => ifcItem.isAlwaysVisible() || ifcItem.isSelectable())
	const saveData: Record<ExpressId, IfcItemUserData> = {}
	for (const ifcItem of meshesToSave) {
		saveData[ifcItem.userData.expressId] = ifcItem.userData
	}
	return saveData
}

/**
 * Restores the user data of IFC model items from the saved data.
 *
 * @param ifcModel - The IFC model containing the items to restore.
 * @param savedData - An array of saved data objects indexed by the expressId of the IFC items.
 *
 * @remarks
 * This function iterates over the children of the provided IFC model and restores their user data
 * from the corresponding saved data based on the expressId.
 */
const restoreData = (ifcModel: IfcModel, savedData: IfcItemUserData[]): void => {
	for (const ifcItem of ifcModel.children) {
		const data = savedData[ifcItem.userData.expressId]
		if (data) {
			ifcItem.userData = data
		}
	}
}

export { getDataToSave, restoreData }
