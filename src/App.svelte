<script>
	
	import Tabs from "./shared/Tabs.svelte";
	import ProductsTable from "./components/ProductsTable.svelte";
	import Updates from "./components/Updates.svelte";
	import Profile from "./components/Profile.svelte";

	let groups = [{name: "Home", tabs:["Profile","Updates"]}, {name:"Warehouse", tabs:["Products"]}];
	let activeGroup = "Home";
	let activeTab = "Updates";
	let products = [{
  "_id": "DHv3zsZglAYSOid",
  "name": "Syringes",
  "manufacturer": "",
  "supplier": "Qosina",
  "pieces": 1200,
  "pieceType": "syringes",
  "catalogueNumber": "",
  "sds": "",
  "status": "Active",
  "__v": 0
},{
  "_id": "LDb6zsSclZWSOid",
  "name": "1ml filter tips",
  "manufacturer": "Eppendorf",
  "supplier": "EJ Busuttil",
  "pieces": null,
  "pieceType": "tips",
  "catalogueNumber": "A050931",
  "sds": "",
  "status": "Active",
  "__v": 0
},{
  "_id": "ALv2zsSclAWZOid",
  "name": "Nitrile Gloves XL",
  "manufacturer": "INTCO",
  "supplier": "Medik Malta",
  "pieces": 50,
  "pieceType": "gloves",
  "catalogueNumber": "G000008",
  "sds": "",
  "status": "Active",
  "__v": 0
}]

	let updates = [];

	const tabChange = (e) => {
		activeGroup = e.detail.group;
		activeTab = e.detail.tab;
	}
</script>

<main>
	<div>
		<h1>L I G M A <img src="./imgs/logo.png" alt="Johnson, the frog" style="width:40px"></h1>
	</div>
	<Tabs {activeGroup} {groups} on:tabChange={tabChange}/>
	{#if activeTab === "Products"}
	<ProductsTable bind:updates={updates} bind:products={products}/>
	{:else if activeTab === "Updates"}
	<Updates updates={updates} />
	{:else if activeTab === "Profile"}
	<Profile />
	{/if}
</main>

<style>
	main {
		text-align: center;
		padding: 0 1em;
		max-width: none;
		margin: 0 auto;
	}

</style>