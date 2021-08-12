
document.body.innerHTML += "Hello world! " + document.body.id;

const canvas = document.createElement("canvas");
canvas.id = "canvas";
canvas.oncontextmenu = () => false;
document.body.appendChild(canvas);

