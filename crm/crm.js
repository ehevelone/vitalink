function logout(){

  sessionStorage.removeItem("agentSessionToken");
  sessionStorage.removeItem("agentName");
  sessionStorage.removeItem("agentId");
  sessionStorage.removeItem("crm_uuid");

  window.location.href = "login.html";

}

function formatDate(value){

  if(!value){
    return "";
  }

  return String(value).split("T")[0];

}

function formatPhone(phone){

  if(!phone){
    return "";
  }

  const digits =
    phone.replace(/\D/g,"");

  if(digits.length !== 10){
    return phone;
  }

  return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;

}

function toggleMobileMenu(){

  const sidebar =
    document.querySelector(".sidebar");

  if(sidebar){
    sidebar.classList.toggle("open");
  }

}

document.addEventListener("DOMContentLoaded", () => {

  if(document.querySelector(".sidebar")){

    document.body.insertAdjacentHTML(
      "afterbegin",
      `
      <button
        class="mobile-menu-btn"
        onclick="toggleMobileMenu()"
      >
        Menu
      </button>
      `
    );

  }

});
