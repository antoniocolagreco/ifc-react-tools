import type IfcItem from '@/classes/ifc-item'
import type IfcModel from '@/classes/ifc-model'
import type {
	ExpressId,
	LinkRequirements,
	Property,
	PropertySet,
	PropertyValue,
	Requirements,
	SelectableRequirements,
} from '@/types/types'
import { IFC2X3, IFCRELDEFINESBYPROPERTIES, type Handle, type IFC4X3, type IfcAPI } from 'web-ifc'

/**
 * Sets the type and properties of an IFC item.
 *
 * @param ifcAPI - The IFC API instance used to interact with the IFC model.
 * @param modelID - The ID of the IFC model.
 * @param ifcItem - The IFC item to set the type and properties for.
 * @param deep - A boolean indicating whether to perform a deep retrieval of properties. Defaults to `false`.
 *
 * This function retrieves the type and properties of the specified IFC item from the IFC model using the provided IFC API instance.
 * It updates the `userData` of the `ifcItem` with the retrieved type, name, and properties.
 *
 * The function performs the following steps:
 * 1. Retrieves the IFC line data for the given `expressId` of the `ifcItem`.
 * 2. Determines the type of the IFC item using the `GetNameFromTypeCode` method of the `ifcAPI`.
 * 3. Collects the relations defined by properties or type from the IFC line data.
 * 4. Iterates through the relations to retrieve property sets and their properties.
 * 5. Updates the `userData` of the `ifcItem` with the retrieved type, name, and properties.
 */
const setIfcItemTypeAndProperties = (ifcAPI: IfcAPI, modelID: number, ifcItem: IfcItem, deep = false): void => {
	const { expressId } = ifcItem.userData
	const data = ifcAPI.GetLine(modelID, expressId, true, true) as IFC2X3.IfcBuildingElement
	const type = ifcAPI.GetNameFromTypeCode(data.type)

	const relations: (IFC2X3.IfcRelDefinesByProperties | IFC2X3.IfcRelDefinesByType)[] = []

	if (data.IsDefinedBy) {
		relations.push(...(data.IsDefinedBy as (IFC2X3.IfcRelDefinesByProperties | IFC2X3.IfcRelDefinesByType)[]))
	}

	const propertySets: PropertySet[] = []
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
			propertySets.push(propertySet)
		}
	}

	ifcItem.userData.type = type
	ifcItem.userData.name = data.Name?.value ?? ''
	ifcItem.userData.properties = propertySets
}

/**
 * Finds the value of a specified property from an IFC item.
 *
 * @param ifcItem - The IFC item to search for the property.
 * @param propertyName - The name of the property to find.
 * @returns The value of the specified property, or `undefined` if the property is not found.
 */
const findPropertyValueFromIfcItem = (ifcItem: IfcItem, propertyName: string): Property['value'] | undefined => {
	if (!ifcItem.userData.properties) return undefined

	for (const propertySet of ifcItem.userData.properties) {
		for (const property of propertySet.properties) {
			if (property.name.toLocaleLowerCase() === propertyName.toLocaleLowerCase()) return property.value
		}
	}

	return undefined
}

/**
 * Checks if a given property value matches another property value.
 *
 * @param valueToCheck - The property value to be checked.
 * @param valueToFind - The property value to find.
 * @param precise - If true, checks for an exact match; if false, checks if the valueToFind is included in valueToCheck. Default is true.
 * @returns True if the property values match based on the precise flag, otherwise false.
 */
const isPropertyEqual = (valueToCheck: PropertyValue, valueToFind: PropertyValue, precise = true): boolean => {
	const normalizedValueToCheck = String(valueToCheck).toLowerCase()
	const normalizedValueToFind = String(valueToFind).toLowerCase()
	if (precise) return normalizedValueToCheck === normalizedValueToFind
	return normalizedValueToCheck.includes(normalizedValueToFind)
}

/**
 * Checks if an IFC item has specific properties and optionally matches a specified type.
 *
 * @param ifcItem - The IFC item to check.
 * @param propertiesToFind - An array of properties to look for in the IFC item.
 * @param type - (Optional) The type that the IFC item should match.
 * @returns `true` if the IFC item has all the specified properties and matches the type (if provided), otherwise `false`.
 */
const isPropertiesAndTypeMatched = (ifcItem: IfcItem, propertiesToFind: Property[], type?: string): boolean => {
	// Controlla se l'oggetto ha delle proprietà utente
	if (!ifcItem.userData.properties) return false

	// Controlla se il tipo dell'oggetto corrisponde al tipo specificato (se fornito)
	if (type && ifcItem.userData.type !== type) return false

	// Itera su ciascuna proprietà da trovare
	for (const propertyToFind of propertiesToFind) {
		// Controlla se l'oggetto ha la proprietà specificata
		const valid = isPropertyMatched(ifcItem, propertyToFind)
		if (!valid) return false
	}

	// Se tutte le proprietà corrispondono, ritorna true
	return true
}

/**
 * Checks if a given property exists in an IFC item.
 *
 * @param ifcItem - The IFC item to search within.
 * @param propertyToFind - The property to find, containing a name and value.
 * @returns `true` if the property is found in the IFC item, otherwise `false`.
 *
 * The function searches through the properties of the IFC item and checks if either the name,
 * the value, or both match the provided property to find. If a match is found, it returns `true`.
 * If no match is found, it returns `false`.
 */
const isPropertyMatched = (ifcItem: IfcItem, propertyToFind: Property): boolean => {
	const nameToFind = propertyToFind.name
	const valueToFind = propertyToFind.value

	if (!ifcItem.userData.properties) return false

	// Itera su ciascun set di proprietà nell'oggetto
	for (const propertySet of ifcItem.userData.properties) {
		// Itera su ciascuna proprietà nel set di proprietà
		for (const property of propertySet.properties) {
			const propertyValueAsString = String(property.value)

			// Controlla se solo il nome della proprietà corrisponde
			if (!valueToFind && nameToFind && isPropertyEqual(property.name, nameToFind, false)) {
				return true
			}

			// Controlla se solo il valore della proprietà corrisponde
			if (valueToFind && !nameToFind && isPropertyEqual(propertyValueAsString, valueToFind)) {
				return true
			}

			// Controlla se sia il nome che il valore della proprietà corrispondono
			if (
				valueToFind &&
				nameToFind &&
				isPropertyEqual(property.name, nameToFind, false) &&
				isPropertyEqual(propertyValueAsString, valueToFind)
			) {
				return true
			}
		}
	}

	// Se nessuna proprietà corrisponde, ritorna false
	return false
}

/**
 * Filters IFC items by specified properties and type.
 *
 * @param ifcModel - The IFC model containing items to be filtered.
 * @param propertiesToFind - An array of properties to match against the items.
 * @param type - (Optional) The type of items to filter.
 * @returns An array of IFC items that match the specified properties and type.
 */
const filterIfcItemsByPropertiesAndType = (
	ifcModel: IfcModel,
	propertiesToFind: Property[],
	type?: string,
): IfcItem[] => {
	const foundItems: IfcItem[] = []

	const stack: IfcItem[] = [...ifcModel.children]

	while (stack.length > 0) {
		const current = stack.pop()

		if (!current) continue

		if (isPropertiesAndTypeMatched(current, propertiesToFind, type)) {
			foundItems.push(current)
		}
	}

	return foundItems
}

/**
 * Checks if an IFC item meets the specified requirements.
 *
 * @param ifcItem - The IFC item to be validated.
 * @param requirements - The requirements that the IFC item must meet. If undefined, the item is considered valid.
 * @returns `true` if the IFC item meets the requirements, `false` otherwise.
 */
const doesIfcItemSatisfiesRequirements = (ifcItem: IfcItem, requirements: Requirements | undefined): boolean => {
	// Check if there are any selection requirements
	if (!requirements) {
		return true
	}

	// Check if the object is the correct type
	if (requirements.requiredType && ifcItem.userData.type !== requirements.requiredType) {
		return false
	}

	// Check if the object has no properties
	if (!requirements.requiredProperties || requirements.requiredProperties.length === 0) {
		return true
	}

	// Check if the object has the required properties
	if (!isPropertiesAndTypeMatched(ifcItem, requirements.requiredProperties)) {
		return false
	}

	return true
}

const removePropertiesFromIfcItems = (ifcModel: IfcModel): void => {
	for (const ifcItem of ifcModel.children) {
		delete ifcItem.userData.properties
	}
}

/**
 * Sets the `selectable` property of an `IfcItem` based on the provided requirements.
 *
 * @param ifcItem - The IFC item to be evaluated and potentially marked as selectable.
 * @param ifcModel - The IFC model containing the item and its related items.
 * @param requirements - An array of selectable requirements that the `ifcItem` must satisfy.
 *
 * The function iterates through the provided requirements to determine if the `ifcItem`
 * meets any of them. If a requirement is met, the `selectable` property of the `ifcItem`
 * is set to `true`. If the requirement includes `linkRequirements`, the function also
 * checks related items in the `ifcModel` to see if they satisfy the link requirements.
 */
const setIfcItemSelectable = (ifcItem: IfcItem, ifcModel: IfcModel, requirements: SelectableRequirements[]): void => {
	let selectable = false

	for (const selectableRequirement of requirements) {
		if (selectable) {
			break
		}
		if (!doesIfcItemSatisfiesRequirements(ifcItem, selectableRequirement)) {
			continue
		}

		const { linkRequirements } = selectableRequirement

		if (!linkRequirements) {
			selectable = true
			break
		}

		const links = ifcItem.userData.links ?? {}
		const linkItems = ifcModel.children.filter(linkItem => linkItem.userData.expressId in links)

		for (const linkItem of linkItems) {
			if (doesIfcItemSatisfiesRequirements(linkItem, linkRequirements)) {
				selectable = true
				break
			}
		}
	}

	ifcItem.userData.selectable = selectable
}

/**
 * Sets the `alwaysVisible` property of an `IfcItem` based on the provided requirements.
 *
 * @param ifcItem - The IFC item to be evaluated.
 * @param requirements - An array of requirements that the IFC item must satisfy to be always visible.
 */
const setIfcItemAlwaysVisible = (ifcItem: IfcItem, requirements: Requirements[]): void => {
	let alwaysVisible = true

	for (const selectableRequirement of requirements) {
		if (!doesIfcItemSatisfiesRequirements(ifcItem, selectableRequirement)) {
			alwaysVisible = false
			break
		}
	}
	ifcItem.userData.alwaysVisible = alwaysVisible
}

/**
 * Sets the links for a given IFC item based on the specified link requirements.
 *
 * @param ifcItem - The IFC item for which the links are to be set.
 * @param ifcModel - The IFC model containing the items to be linked.
 * @param linkRequirements - An array of link requirements that specify the properties and values to be used for linking.
 *
 * The function iterates over the provided link requirements and finds the corresponding property values in the IFC item.
 * It then searches for other items in the IFC model that match these properties and sets the links accordingly.
 *
 * The links are stored in the `userData.links` property of the IFC item, where the key is the link property name and the value is an array of express IDs of the linked items.
 */
const setIfcItemLinks = (ifcItem: IfcItem, ifcModel: IfcModel, linkRequirements: LinkRequirements[]): void => {
	const links: Record<string, ExpressId[]> = {}

	for (const linkRequirement of linkRequirements) {
		const { linkPropertyName } = linkRequirement

		const propertiesToFind: Property[] = []

		const linkPropertyValue = findPropertyValueFromIfcItem(ifcItem, linkPropertyName)
		// If the link property has no value, any comparison can be made, so no relative can be founbd
		if (!linkPropertyValue) {
			return
		}

		propertiesToFind.push({ name: linkPropertyName, value: linkPropertyValue })

		if (linkRequirement.requiredProperties) {
			for (const requiredProperty of linkRequirement.requiredProperties) {
				propertiesToFind.push(requiredProperty)
			}
		}

		const linkedItems = filterIfcItemsByPropertiesAndType(ifcModel, propertiesToFind)

		links[linkPropertyName] = linkedItems.map(linkedItem => linkedItem.userData.expressId)
	}

	ifcItem.userData.links = links
}

const setIfcData = (
	ifcModel: IfcModel,
	linkRequirements?: LinkRequirements[],
	selectableRequirement?: SelectableRequirements[],
	alwaysVisibleRequirement?: Requirements[],
	anchorsRequirement?: Requirements[],
) => {
	for (const ifcItem of ifcModel.children) {
		if (linkRequirements) {
			setIfcItemLinks(ifcItem, ifcModel, linkRequirements)
		}
		if (selectableRequirement) {
			setIfcItemSelectable(ifcItem, ifcModel, selectableRequirement)
		}
		if (alwaysVisibleRequirement) {
			setIfcItemAlwaysVisible(ifcItem, alwaysVisibleRequirement)
		}
	}
}

export {
	doesIfcItemSatisfiesRequirements,
	filterIfcItemsByPropertiesAndType,
	findPropertyValueFromIfcItem,
	removePropertiesFromIfcItems,
	setIfcData,
	setIfcItemAlwaysVisible,
	setIfcItemLinks,
	setIfcItemSelectable,
	setIfcItemTypeAndProperties,
}
