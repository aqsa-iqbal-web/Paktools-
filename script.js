// PAGE NAVIGATION
function showPage(id) {
    document.querySelectorAll(".page").forEach(page => {
        page.classList.remove("active");
    });

    const page = document.getElementById(id);

    if (page) {
        page.classList.add("active");
    }
}

function updatePage() {
    let id = location.hash.replace("#", "") || "home";
    showPage(id);
}

window.addEventListener("hashchange", updatePage);
updatePage();


// PASSPORT PHOTO MAKER
function makePassport() {
    const file = document.getElementById("passportFile").files[0];
    const result = document.getElementById("passportResult");

    if (!file) {
        result.textContent = "Please select a photo first.";
        return;
    }

    if (!file.type.startsWith("image/")) {
        result.textContent = "Please select a valid image.";
        return;
    }

    const image = new Image();
    const reader = new FileReader();

    reader.onload = function(e) {
        image.onload = function() {
            const width = 413;
            const height = 531;

            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext("2d");

            ctx.fillStyle = document.getElementById("whiteBg").checked
                ? "#ffffff"
                : "#eeeeee";

            ctx.fillRect(0, 0, width, height);

            const scale = Math.max(width / image.width, height / image.height);
            const sw = width / scale;
            const sh = height / scale;
            const sx = (image.width - sw) / 2;
            const sy = (image.height - sh) / 2;

            ctx.drawImage(image, sx, sy, sw, sh, 0, 0, width, height);

            const photo = canvas.toDataURL("image/jpeg", 0.95);

            const sheet = document.createElement("canvas");
            sheet.width = 1240;
            sheet.height = 1754;

            const sctx = sheet.getContext("2d");
            sctx.fillStyle = "white";
            sctx.fillRect(0, 0, sheet.width, sheet.height);

            const positions = [
                [100, 100],
                [620, 100],
                [100, 800],
                [620, 800]
            ];

            positions.forEach(pos => {
                sctx.drawImage(canvas, pos[0], pos[1], width, height);
            });

            result.innerHTML =
                "<p>Passport photo created: 35 × 45 mm at 300 DPI.</p>" +
                "<img src='" + photo + "' alt='Passport photo preview'>" +
                "<br><a class='btn' href='" + photo + "' download='passport-photo.jpg'>Download Photo</a>" +
                "<br><br><a class='btn' href='" + sheet.toDataURL("image/jpeg", 0.95) + "' download='four-passport-photos.jpg'>Download Four Copies Sheet</a>";
        };

        image.src = e.target.result;
    };

    reader.readAsDataURL(file);
}


// IMAGE TO PDF CONVERTER
document.getElementById("pdfFiles").addEventListener("change", function() {
    const preview = document.getElementById("pdfPreview");
    preview.innerHTML = "";

    Array.from(this.files).forEach(file => {
        const reader = new FileReader();

        reader.onload = function(e) {
            const img = document.createElement("img");
            img.src = e.target.result;
            img.alt = "Selected image preview";
            img.style.maxWidth = "100px";
            preview.appendChild(img);
        };

        reader.readAsDataURL(file);
    });
});

async function convertPDF() {
    const files = document.getElementById("pdfFiles").files;
    const result = document.getElementById("pdfPreview");

    if (!files.length) {
        result.textContent = "Please select images first.";
        return;
    }

    result.textContent = "Preparing your PDF...";

    const images = [];

    for (const file of files) {
        const data = await new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(file);
        });

        const image = await new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = data;
        });

        images.push(image);
    }

    const pageW = 595;
    const pageH = 842;
    const encoder = new TextEncoder();

    let objects = [];
    let offsets = [0];

    function addObject(content) {
        objects.push(content);
        return objects.length;
    }

    const catalogId = addObject("");
    const pagesId = addObject("");

    const pageIds = [];

    for (const img of images) {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext("2d").drawImage(img, 0, 0);

        const jpg = canvas.toDataURL("image/jpeg", 0.9).split(",")[1];
        const binary = atob(jpg);
        const bytes = new Uint8Array(binary.length);

        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }

        const imageId = addObject({
            dictionary: `/Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length}`,
            stream: bytes
        });

        const scale = Math.min(pageW / canvas.width, pageH / canvas.height);
        const w = canvas.width * scale;
        const h = canvas.height * scale;
        const x = (pageW - w) / 2;
        const y = (pageH - h) / 2;

        const content = `q ${w} 0 0 ${h} ${x} ${y} cm /Im0 Do Q`;

        const contentId = addObject({
            dictionary: `/Length ${encoder.encode(content).length}`,
            stream: encoder.encode(content)
        });

        const pageId = addObject(
            `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`
        );

        pageIds.push(pageId);
    }

    objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
    objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map(id => id + " 0 R").join(" ")}] /Count ${pageIds.length} >>`;

    let pdf = "%PDF-1.4\n";
    let byteLength = encoder.encode(pdf).length;

    objects.forEach((obj, index) => {
        offsets.push(byteLength);

        let header = `${index + 1} 0 obj\n`;
        pdf += header;
        byteLength += encoder.encode(header).length;

        if (typeof obj === "string") {
            const body = obj + "\n";
            pdf += body;
            byteLength += encoder.encode(body).length;
        } else {
            const dict = `<< ${obj.dictionary} >>\nstream\n`;
            pdf += dict;
            byteLength += encoder.encode(dict).length;

            const prefix = new TextEncoder().encode(pdf);
            const suffix = new TextEncoder().encode("\nendstream\n");

            const combined = new Uint8Array(prefix.length + obj.stream.length + suffix.length);
            combined.set(prefix);
            combined.set(obj.stream, prefix.length);
            combined.set(suffix, prefix.length + obj.stream.length);

            pdf = combined;
            byteLength = combined.length;
        }

        const end = "\nendobj\n";
        if (typeof pdf === "string") {
            pdf += end;
            byteLength += encoder.encode(end).length;
        } else {
            const suffix = encoder.encode(end);
            const combined = new Uint8Array(pdf.length + suffix.length);
            combined.set(pdf);
            combined.set(suffix, pdf.length);
            pdf = combined;
            byteLength = combined.length;
        }
    });

    if (typeof pdf === "string") {
        pdf = encoder.encode(pdf);
    }

    const xrefOffset = pdf.length;
    let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;

    for (let i = 1; i < offsets.length; i++) {
        xref += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
    }

    xref += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    const finalBytes = new Uint8Array(pdf.length + encoder.encode(xref).length);
    finalBytes.set(pdf);
    finalBytes.set(encoder.encode(xref), pdf.length);

    const blob = new Blob([finalBytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "paktools-images.pdf";
    link.click();

    URL.revokeObjectURL(url);
    result.textContent = "Your PDF has been downloaded.";
}


// PERCENTAGE CALCULATOR
function calculatePercentage() {
    const obtained = Number(document.getElementById("obtained").value);
    const total = Number(document.getElementById("total").value);
    const result = document.getElementById("percentageResult");

    if (
        document.getElementById("obtained").value === "" ||
        document.getElementById("total").value === "" ||
        !Number.isFinite(obtained) ||
        !Number.isFinite(total) ||
        total <= 0 ||
        obtained < 0 ||
        obtained > total
    ) {
        result.textContent = "Please enter valid marks. Obtained marks cannot exceed total marks.";
        return;
    }

    const percentage = (obtained / total) * 100;

    let grade;

    if (percentage >= 90) grade = "A+";
    else if (percentage >= 80) grade = "A";
    else if (percentage >= 70) grade = "B";
    else if (percentage >= 60) grade = "C";
    else if (percentage >= 50) grade = "D";
    else grade = "Below 50%";

    result.innerHTML =
        "<h3>Your Percentage: " + percentage.toFixed(2) + "%</h3>" +
        "<p>Estimated grade: " + grade + "</p>" +
        "<small>Illustrative grade only. Official board grading may differ.</small>";
}


// AGE CALCULATOR
function calculateAge() {
    const value = document.getElementById("dob").value;
    const result = document.getElementById("ageResult");

    if (!value) {
        result.textContent = "Please select your date of birth.";
        return;
    }

    const parts = value.split("-").map(Number);
    const birth = new Date(parts[0], parts[1] - 1, parts[2]);
    const today = new Date();

    today.setHours(0, 0, 0, 0);

    if (birth > today) {
        result.textContent = "Date of birth cannot be in the future.";
        return;
    }

    let years = today.getFullYear() - birth.getFullYear();
    let months = today.getMonth() - birth.getMonth();
    let days = today.getDate() - birth.getDate();

    if (days < 0) {
        months--;
        const previousMonthDays = new Date(
            today.getFullYear(),
            today.getMonth(),
            0
        ).getDate();

        days += previousMonthDays;
    }

    if (months < 0) {
        years--;
        months += 12;
    }

    let nextBirthday = new Date(
        today.getFullYear(),
        birth.getMonth(),
        birth.getDate()
    );

    if (nextBirthday <= today) {
        nextBirthday = new Date(
            today.getFullYear() + 1,
            birth.getMonth(),
            birth.getDate()
        );
    }

    const remaining = nextBirthday - today;
    const remainingDays = Math.ceil(remaining / 86400000);
    const nextAge = years + (remainingDays === 0 ? 0 : 1);

    result.innerHTML =
        "<h3>Your Age</h3>" +
        "<p>" + years + " years, " + months + " months and " + days + " days</p>" +
        "<p>Next birthday in " + remainingDays + " days.</p>" +
        "<p>You will turn " + nextAge + " years old.</p>";
}


// IMAGE RESIZER
function resizeImage() {
    const file = document.getElementById("resizeFile").files[0];
    const target = Number(document.getElementById("targetSize").value) * 1024;
    const result = document.getElementById("resizeResult");

    if (!file) {
        result.textContent = "Please select an image first.";
        return;
    }

    if (!file.type.startsWith("image/")) {
        result.textContent = "Please select a valid image.";
        return;
    }

    const reader = new FileReader();

    reader.onload = function(e) {
        const image = new Image();

        image.onload = function() {
            const canvas = document.createElement("canvas");
            const maxDimension = 2000;
            const scale = Math.min(
                1,
                maxDimension / Math.max(image.width, image.height)
            );

            canvas.width = Math.round(image.width * scale);
            canvas.height = Math.round(image.height * scale);

            const ctx = canvas.getContext("2d");
            ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

            let quality = 0.9;
            let output;

            function compress() {
                canvas.toBlob(function(blob) {
                    if (!blob) {
                        result.textContent = "Could not resize this image.";
                        return;
                    }

                    if (blob.size > target && quality > 0.1) {
                        quality -= 0.1;
                        compress();
                        return;
                    }

                    const url = URL.createObjectURL(blob);

                    result.innerHTML =
                        "<p>Resized image size: " + (blob.size / 1024).toFixed(1) + " KB</p>" +
                        "<p>Target: " + (target / 1024) + " KB</p>" +
                        "<img src='" + url + "' alt='Resized preview'>" +
                        "<br><a class='btn' href='" + url + "' download='resized-image.jpg'>Download Image</a>";

                }, "image/jpeg", quality);
            }

            compress();
        };

        image.onerror = function() {
            result.textContent = "Unable to read this image.";
        };

        image.src = e.target.result;
    };

    reader.readAsDataURL(file);
}


// WORD COUNTER
function countWords() {
    const text = document.getElementById("wordText").value;

    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const characters = text.length;
    const sentences = text.trim()
        ? (text.match(/[.!?]+/g) || []).length
        : 0;

    const readingTime = words === 0
        ? 0
        : Math.max(1, Math.ceil(words / 200));

    document.getElementById("wordResult").innerHTML =
        "<strong>Words:</strong> " + words +
        " | <strong>Characters:</strong> " + characters +
        " | <strong>Sentences:</strong> " + sentences +
        " | <strong>Reading time:</strong> " + readingTime + " min";
}


// CONTACT FORM
document.getElementById("contactForm").addEventListener("submit", function(e) {
    e.preventDefault();

    const name = document.getElementById("contactName").value.trim();
    const email = document.getElementById("contactEmail").value.trim();
    const message = document.getElementById("contactMessage").value.trim();

    if (!name || !email || !message) {
        document.getElementById("contactStatus").textContent =
            "Please complete all fields.";
        return;
    }

    const yourEmail = "YOUR_EMAIL@example.com";

    const subject = encodeURIComponent("PakTools Contact Message");
    const body = encodeURIComponent(
        "Name: " + name +
        "\nEmail: " + email +
        "\n\nMessage:\n" + message
    );

    document.getElementById("contactStatus").textContent =
        "Opening your email application...";

    window.location.href =
        "mailto:" + yourEmail + "?subject=" + subject + "&body=" + body;
}
);