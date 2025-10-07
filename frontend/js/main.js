async function login(){
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('error');

    try{
        const res = await fetch('http://localhost:5000/login', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({username,password})
        });
        if(res.status === 401){
            errorEl.textContent='שם משתמש או סיסמה לא נכונים';
            return;
        }
        const data = await res.json();
        localStorage.setItem('user', JSON.stringify(data));

        // Redirect based on role
        if(data.role==='student') window.location.href='student/dashboard.html';
        else window.location.href='admin/manage_courses.html';
    } catch(err){
        console.error(err);
    }
}
