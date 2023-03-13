export const getData = async (endpoint) => {
    const response = await fetch(endpoint);
    const { data } = await response.json();

    return data;
}

export const filterData = async (data, filterKey) => {

    data = await data

    let newData = []

    if (filterKey !== []){

      data.forEach((entry) => {
        const array = Object.values(entry)

        let match = []
      
        array.forEach((element) => {
          if (element){
            if (typeof element !== "string") {
              element = element.toString()
            }
            match.push(element.includes(filterKey))
          } 
        })

      if (match.includes(true)){
        newData.push(entry)
      }
    })
  }

    data = newData

    return data
  }

export const sortData = async(data, sortKey, direction) => {
    data = await data.sort(function(a, b){return a[sortKey] - b[sortKey]});
}

export const paginateData = async(data, pageLength) => {

    const length = await data.length;

    let newData = []

    for (let i = 0; i < length; i += pageLength){
      let j = i+pageLength;
      newData.push(data.slice(i,j));
    }

    data = newData;
    
    return data;
}

export const deleteById = async(endpoint, id) => {
  const res = await fetch(endpoint, {
    method: 'DELETE',
    body: JSON.stringify({
      _id: id
      })
    })
}

export const clearInputsById = (id) => {
  let inputs = document.getElementById(id).getElementsByTagName("input");

  for (let i=0; i < inputs.length; i++){
    inputs[i].value = ""
  }
}

export const capitalizeFirstLetter = (string) => {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

export const grabInputsByParentId = (id) => {
  let inputsArray = document.getElementById(id).getElementsByTagName("input");

  let selectsArray = document.getElementById(id).getElementsByTagName("select");
      
  let inputsObject = {};

    for (let i=0; i < inputsArray.length; i++){
      let input = inputsArray[i];
        
      inputsObject[input.name] = input.value;
    
    }

    for (let i=0; i < selectsArray.length; i++){
      let option = selectsArray[i];

      inputsObject[option.name] = option.value;

    }

  return inputsObject;
}

const isFieldFilled = (HTMLelement) => {
  let input = HTMLelement.value.trim();

  return input !== ''
}

export const areAllFieldsFilled = (HTMLelementsArray) => {

  let missingInputs = [];

  HTMLelementsArray.forEach((input) => {
    if (!isFieldFilled(input)) {
    //change color of input field to orangered
    input.classList.add("alert");

    missingInputs.push(true)
    } else {
    input.classList.remove("alert");
  }})

  return !missingInputs.includes(true)
}

export const objToString = (obj) => {
  let string = Object.keys(obj)
  .map(function (key) {
    return obj[key];
  })
  .join(' ');

  return string;
}

export const objArrayToStringArray = (arr) => {
  let result = [];

  for (let i = 0; i < arr.length ; i++) {
    const string = objToString(arr[i]);

    result.push(string);
  }

  return result;
}

