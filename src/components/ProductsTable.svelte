<script>

  import { filterData, clearInputsById, grabInputsByParentId, areAllFieldsFilled } from '../utils/utils.js';

  import { v4 as uuidv4 } from "uuid";

  export let updates;
  export let products;

	function generateUuid() {
	  const uuid = uuidv4();

    return uuid;
	}

  import TableAddRow from './TableAddRow.svelte';

  let filterKey = "";

  $: filteredData = filterData(products, filterKey);

  let selectableInputObjects = {
    pieceType: ["tips", "syringes", "racks", "gloves", "masks"],
    status: ["Active", "Inactive"]
  }
  
  let addRowEntry = ["_id", "name", "manufacturer", "supplier", "pieces", "pieceType", "catalogueNumber", "sds", "status"]
  
  const addProduct = async(id) => {
    let inputName = document.getElementById(id).getElementsByTagName("input")[1]; 

    let requiredInputs = [inputName];

    if (!areAllFieldsFilled(requiredInputs)){
      return
    }

      let inputsObject = grabInputsByParentId(id);

      let uuid = generateUuid();

      let status = "Active";

      inputsObject._id = uuid;

      inputsObject.status = status;

      products.push(inputsObject);

      let update = {}

      update.subject = "Johnson";
      update.action = "added a Product with _id: ";
      update.object = inputsObject._id;

      updates.push(update);

      products = products;

      clearInputsById(id);
    }

  const editProduct = async(id) => {
    let inputName = document.getElementById(id).getElementsByTagName("input")[1]; 

    let requiredInputs = [inputName];

    if (!areAllFieldsFilled(requiredInputs)){
      return
    }

    let inputsObject = grabInputsByParentId(id);

    products = products.filter((element) => {
      return element._id !== id
    })

    products.push(inputsObject);

    let update = {}

    update.subject = "Johnson";
    update.action = "edited a Product with _id: ";
    update.object = id;

    updates.push(update);

    products = products;
  }

  const deleteProduct = async(id) => {
    
    products = products.filter((element) => {
      return element._id !== id
    })

    let update = {}

    update.subject = "Johnson";
    update.action = "deleted a Product with _id: ";
    update.object = id;

    updates.push(update);

    products=products;
  }
</script>

<div><h2>Products Catalogue</h2></div>

<div class="table-wrapper">
<table>
  <thead class="form">
      <input type="text" bind:value={filterKey} placeholder="Filter by all">
  </thead>
  <hr>
  <tbody>
  {#await filteredData then entries}
  <tr class="form" id="add-product">
    <TableAddRow disabledInputs={["_id","status"]} ignoredInputs={"__v"} entry={addRowEntry} selectableInputObjects={selectableInputObjects}/>
    <td class="form-field">
        <br>
        <button type="button" on:click={ async () => { await addProduct("add-product")} } style="width:100%">Add</button>
    </td>
  </tr>
  <hr>
  {#if entries.length !== 0}
  {#each entries as entry}
  <tr class="form" id={entry._id}>
    <td class="form-field">
      <input type="text" name="_id" placeholder={entry._id} disabled value={entry._id}>
    </td>
    <td class="form-field">
      <input type="text" name="name" placeholder="" value={entry.name}>
    </td>
    <td class="form-field">
      <input type="text" name="manufacturer" placeholder="" value={entry.manufacturer}>
    </td>
    <td class="form-field">
      <input type="text" name="supplier" placeholder="" value={entry.supplier}>
    </td>
    <td class="form-field">
      <input type="number" name="pieces" placeholder="" value={entry.pieces}>
    </td>
    <td class="form-field">
      <select name="pieceType">
        <option value={entry.pieceType}>{entry.pieceType}</option>
        {#each selectableInputObjects["pieceType"] as optionValue}
            {#if optionValue !== entry.pieceType}
            <option value={optionValue}>{optionValue}</option>
            {/if}
        {/each}
    </select>
    </td>
    <td class="form-field">
      <input type="text" name=catalogueNumber placeholder="" value={entry.catalogueNumber}>
    </td>
    <td class="form-field">
      <input type="text" name="sds" placeholder="" value={entry.sds}>
    </td>
    <td class="form-field">
      <select name="status">
        <option value={entry.status}>{entry.status}</option>
        {#each selectableInputObjects["status"] as optionValue}
            {#if optionValue !== entry.status}
            <option value={optionValue}>{optionValue}</option>
            {/if}
        {/each}
    </select>
  </td>
    <td class="form-field">
      <button on:click={ async() => { await editProduct(entry._id) } } style="width:40%">Edit</button> 
      <button on:click={ async() => { await deleteProduct(entry._id) } } style="width:54%">Delete</button>
    </td>
  </tr>
  {/each}
  {:else}
  <p>The table is empty.</p>
  {/if}
    {:catch error}
	    <p style="color: red">{error.message}</p>
    {/await}
  </tbody>
</table>
</div>

<style>

.table-wrapper {
  display: block;
  overflow-x: auto;
  white-space: nowrap;
  width: 100%;
}



table :global(.form-field) {
    width: 10%;
}

table :global(label){
  font-weight: bold;
}

tbody {
  display: block;
}

#add-product :global(input), #add-product :global(select), #add-product button {
  margin-top: 3px;
  margin: 0px;
  width: 100%;
}

table {
	background-color: var(--bg-color);
	border-radius: 9px;
	padding: 9px;
	font-size: 0.6em;
  min-width: 1000px;
  width: 100%;
}

.form {
	display: flex;
    justify-content: center;
}

.form-field {
  display: inline;
}

input, select {
  margin: 0px;
  width: 100%;
} 

</style>