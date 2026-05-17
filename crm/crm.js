function logout(){

  sessionStorage.removeItem("agentSessionToken");
  sessionStorage.removeItem("agentName");
  sessionStorage.removeItem("agentId");
  sessionStorage.removeItem("crm_uuid");

  window.location.href = "login.html";

}

function getCrmSessionHeaders(){

  const token =
    sessionStorage.getItem("agentSessionToken") || "";

  const crmAgentId =
    sessionStorage.getItem("crm_uuid") || "";

  const headers = {};

  if(token){
    headers["x-agent-session"] = token;
  }

  if(crmAgentId){
    headers["x-crm-agent-id"] = crmAgentId;
  }

  return headers;

}

const nativeFetch =
  window.fetch.bind(window);

window.fetch = (input, init = {}) => {

  const url =
    typeof input === "string" ? input : input?.url || "";

  let shouldAttachCrmSession = false;

  try{

    const parsedUrl =
      new URL(url, window.location.origin);

    shouldAttachCrmSession =
      parsedUrl.origin === window.location.origin &&
      parsedUrl.pathname.includes("/.netlify/functions/");

  }catch(err){

    shouldAttachCrmSession = false;

  }

  if(shouldAttachCrmSession){

    init.headers = {
      ...(init.headers || {}),
      ...getCrmSessionHeaders()
    };

  }

  return nativeFetch(input, init);

};

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

  let digits =
    phone.replace(/\D/g,"");

  if(digits.length === 11 && digits.startsWith("1")){
    digits = digits.slice(1);
  }

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
