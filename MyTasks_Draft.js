// MyTasksNew.js - Hỗ trợ cả public & private bucket, không lộ user_id, xử lý đầy đủ edit

const supabase = window.supabase;

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const PRIVATE_BUCKET = 'tasks-private';
const PUBLIC_BUCKET = 'tasks-public';
const SIGNED_EXPIRATION = 3600; // 1 giờ cho private

async function uploadPdf(file, taskId, isPublic = false) {
  if (!file) return null;

  if (file.size > MAX_FILE_SIZE) {
    throw new Error('File PDF vượt quá 50MB');
  }

  const ext = file.name.split('.').pop().toLowerCase();
  if (ext !== 'pdf') {
    throw new Error('Chỉ chấp nhận file PDF');
  }

  const timestamp = Date.now();
  const path = `${taskId}/${timestamp}.${ext}`;  // Không có user_id

  const bucket = isPublic ? PUBLIC_BUCKET : PRIVATE_BUCKET;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file, {
      upsert: false,
      contentType: 'application/pdf'
    });

  if (error) throw error;

  let url = null;
  if (isPublic) {
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    url = data.publicUrl;
  }

  return { path, url, bucket };
}

/*
async function getSignedPdfUrl(pdfPath) {
  if (!pdfPath) return null;

  const { data, error } = await supabase.storage
    .from(PRIVATE_BUCKET)
    .createSignedUrl(pdfPath, SIGNED_EXPIRATION);

  if (error) {
    console.error('Lỗi signed URL:', error);
    return null;
  }
  return data.signedUrl;
}
*/

async function getSignedPdfUrl(pdfPath, bucket = PRIVATE_BUCKET) {
  if (!pdfPath) return null;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(pdfPath, SIGNED_EXPIRATION);

  if (error) {
    console.error('Lỗi signed URL:', error.message, { path: pdfPath, bucket });
    return null;
  }
  return data.signedUrl;
}


/*
async function movePdfToNewBucket(oldData, newIsPublic, taskId) {
  if (!oldData.path) return null;

  // Download file cũ
  const { data: fileBlob, error: downloadError } = await supabase.storage
    .from(oldData.bucket)
    .download(oldData.path);

  if (downloadError) throw downloadError;

  // Upload sang bucket mới
  const newData = await uploadPdf(fileBlob, taskId, newIsPublic);

  // Xóa file cũ
  await supabase.storage.from(oldData.bucket).remove([oldData.path]);

  return newData;
}
*/
async function movePdfToNewBucket(oldData, newIsPublic, taskId) {
  if (!oldData.path) return null;

  // Lấy tên file cũ từ path (ví dụ: "task123/1723456789.pdf" → "1723456789.pdf")
  const oldFileName = oldData.path.split('/').pop();

  // Download file cũ
  const { data: fileBlob, error: downloadError } = await supabase.storage
    .from(oldData.bucket)
    .download(oldData.path);

  if (downloadError) throw downloadError;

  // Tạo path mới với cùng tên file (không cần timestamp mới)
  const newPath = `${taskId}/${oldFileName}`;

  const newBucket = newIsPublic ? PUBLIC_BUCKET : PRIVATE_BUCKET;

  // Upload Blob với tên file gốc
  const { error: uploadError } = await supabase.storage
    .from(newBucket)
    .upload(newPath, fileBlob, {
      upsert: false,  // hoặc true nếu muốn overwrite
      contentType: 'application/pdf'
    });

  if (uploadError) throw uploadError;

  // Lấy public URL nếu public
  let newUrl = null;
  if (newIsPublic) {
    const { data } = supabase.storage.from(newBucket).getPublicUrl(newPath);
    newUrl = data.publicUrl;
  }

  // Xóa file cũ
  await supabase.storage.from(oldData.bucket).remove([oldData.path]);

  return {
    path: newPath,
    url: newUrl,
    bucket: newBucket
  };
}


function MyTasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [user, setUser] = useState(null);

  const [newTitle, setNewTitle] = useState('');
  const [newPdf, setNewPdf] = useState(null);
  const [newIsPublic, setNewIsPublic] = useState(false);
  const newFileInputRef = useRef(null);

  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editPdf, setEditPdf] = useState(null);
  const [editIsPublic, setEditIsPublic] = useState(false);
  const editFileInputRef = useRef(null);

  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    getCurrentUser();
  }, []);

  useEffect(() => {
    if (user) {
      fetchTasks();
    }
  }, [user]);

  async function fetchTasks() {
    if (!user) return;
    
    setLoading(true);
    const { data, error } = await supabase
      .from('tasks_new')
      .select('id, title, completed, pdf_path, pdf_url, pdf_bucket, is_public_pdf, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      setMessage('Lỗi khi tải tasks: ' + error.message);
    } else {
      setTasks(data || []);
    }
    setLoading(false);
  }

  async function addTask() {
    if (!newTitle.trim() || !user) return;

    try {
      setLoading(true);

      const { data: task, error: insertError } = await supabase
        .from('tasks_new')
        .insert({ title: newTitle.trim(), user_id: user.id })
        .select()
        .single();

      if (insertError) throw insertError;

      let pdfData = null;
      if (newPdf) {
        pdfData = await uploadPdf(newPdf, task.id, newIsPublic);
      }

      if (pdfData) {
        await supabase
          .from('tasks_new')
          .update({ 
            pdf_path: pdfData.path,
            pdf_url: pdfData.url,
            pdf_bucket: pdfData.bucket,
            is_public_pdf: newIsPublic
          })
          .eq('id', task.id);
      }

      setTasks([{ ...task, pdf_path: pdfData?.path, pdf_url: pdfData?.url, pdf_bucket: pdfData?.bucket, is_public_pdf: newIsPublic }, ...tasks]);
      setNewTitle('');
      setNewPdf(null);
      setNewIsPublic(false);
      if (newFileInputRef.current) newFileInputRef.current.value = '';
      setMessage('Thêm task thành công!');
    } catch (e) {
      setMessage('Lỗi: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveEdit() {
    if (!user || !editingId) return;

    try {
      setLoading(true);

      const task = tasks.find(t => t.id === editingId);
      if (!task) return;

      let pdfData = {
        path: task.pdf_path,
        url: task.pdf_url,
        bucket: task.pdf_bucket
      };

      let isPublicChanged = editIsPublic !== task.is_public_pdf;

      if (editPdf) {
        // Xóa file cũ nếu có
        if (task.pdf_path) {
          await supabase.storage.from(task.pdf_bucket).remove([task.pdf_path]);
        }
        // Upload file mới với chế độ hiện tại
        pdfData = await uploadPdf(editPdf, task.id, editIsPublic);
      } else if (isPublicChanged && task.pdf_path) {
        // Không thay file, nhưng thay đổi chế độ → di chuyển file sang bucket mới
        pdfData = await movePdfToNewBucket({
          path: task.pdf_path,
          bucket: task.pdf_bucket
        }, editIsPublic, task.id);
      }

      const { error } = await supabase
        .from('tasks_new')
        .update({ 
          title: editTitle.trim(), 
          pdf_path: pdfData.path,
          pdf_url: pdfData.url,
          pdf_bucket: pdfData.bucket,
          is_public_pdf: editIsPublic
        })
        .eq('id', task.id)
        .eq('user_id', user.id);

      if (error) throw error;

      setTasks(tasks.map(t =>
        t.id === task.id ? { ...t, title: editTitle.trim(), pdf_path: pdfData.path, pdf_url: pdfData.url, pdf_bucket: pdfData.bucket, is_public_pdf: editIsPublic } : t
      ));

      cancelEdit();
      if (editFileInputRef.current) editFileInputRef.current.value = '';
      setMessage('Cập nhật thành công!');
    } catch (e) {
      setMessage('Lỗi khi cập nhật: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function deleteTask(task) {
    if (!user) return;

    setLoading(true);
    setMessage('');

    try {
      // Xóa file PDF nếu có
      if (task.pdf_path) {
        await supabase.storage.from(task.pdf_bucket).remove([task.pdf_path]);
      }

      const { error } = await supabase
        .from('tasks_new')
        .delete()
        .eq('id', task.id)
        .eq('user_id', user.id);

      if (error) throw error;

      setTasks(tasks.filter(t => t.id !== task.id));
      setMessage('Đã xóa task và file PDF (nếu có)');
    } catch (err) {
      setMessage('Lỗi khi xóa: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function toggleCompleted(task) {
    if (!user) return;

    try {
      const newCompleted = !task.completed;
      
      await supabase
        .from('tasks_new')
        .update({ completed: newCompleted })
        .eq('id', task.id)
        .eq('user_id', user.id);

      setTasks(tasks.map(t =>
        t.id === task.id ? { ...t, completed: newCompleted } : t
      ));
    } catch (err) {
      console.error('Lỗi toggle completed:', err);
    }
  }

  function startEdit(task) {
    setEditingId(task.id);
    setEditTitle(task.title);
    setEditPdf(null);
    setEditIsPublic(task.is_public_pdf || false);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditTitle('');
    setEditPdf(null);
    setEditIsPublic(false);
    if (editFileInputRef.current) editFileInputRef.current.value = '';
  }

  function checkFile(e, setter) {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.size > MAX_FILE_SIZE) {
      alert('File PDF tối đa 50MB');
      e.target.value = '';
      return;
    }
    
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      alert('Chỉ chấp nhận file PDF');
      e.target.value = '';
      return;
    }
    
    setter(file);
  }

  if (!user) {
    return h('div', { class: 'tasks-container' },
      h('p', null, 'Vui lòng đăng nhập để quản lý tasks của bạn.')
    );
  }

  const TaskItem = ({ task }) =>
    h('li', { class: 'task-item', key: task.id },
      h('input', {
        type: 'checkbox',
        class: 'task-checkbox',
        checked: task.completed,
        onChange: () => toggleCompleted(task)
      }),

      editingId === task.id
        ? h('div', { class: 'edit-mode' },
            h('input', {
              class: 'edit-title-input',
              value: editTitle,
              onInput: e => setEditTitle(e.target.value),
              placeholder: "Tên task..."
            }),

            h('div', { class: 'edit-file-wrapper' },
              h('label', null, 'PDF mới (tùy chọn):'),
              h('input', {
                type: 'file',
                accept: '.pdf',
                class: 'file-input',
                ref: editFileInputRef,
                onChange: e => checkFile(e, setEditPdf)
              })
            ),

            h('div', { class: 'public-checkbox' },
              h('input', {
                type: 'checkbox',
                checked: editIsPublic,
                onChange: e => setEditIsPublic(e.target.checked)
              }),
              h('label', null, 'Làm PDF công khai (ai có link cũng xem được)')
            ),

            task.pdf_path && h('a', {
              href: task.is_public_pdf ? task.pdf_url : '#',
              target: '_blank',
              /*
              onClick: async (e) => {
                if (!task.is_public_pdf) {
                  e.preventDefault();
                  const url = await getSignedPdfUrl(task.pdf_path);
                  if (url) window.open(url, '_blank');
                }
              },
*/
// Trong edit-mode (nếu có link "Xem PDF hiện tại")
onClick: async (e) => {
  if (!task.is_public_pdf) {
    e.preventDefault();
    const url = await getSignedPdfUrl(task.pdf_path, task.pdf_bucket);
    if (url) window.open(url, '_blank');
  }
},


              class: 'current-pdf-link'
            }, 'Xem PDF hiện tại'),

            h('div', { class: 'edit-buttons' },
              h('button', { class: 'btn btn-save', onClick: saveEdit }, 'Lưu'),
              h('button', { class: 'btn btn-cancel', onClick: cancelEdit }, 'Hủy')
            )
          )
        : h('div', { class: 'view-mode' },
            h('span', { class: task.completed ? 'task-title completed' : 'task-title' }, task.title),
            task.pdf_path && h('a', {
              href: task.is_public_pdf ? task.pdf_url : '#',
              target: '_blank',
              /*
              onClick: async (e) => {
                if (!task.is_public_pdf) {
                  e.preventDefault();
                  const url = await getSignedPdfUrl(task.pdf_path);
                  if (url) window.open(url, '_blank');
                }
              },
*/
// Trong view-mode
onClick: async (e) => {
  if (!task.is_public_pdf) {
    e.preventDefault();
    const url = await getSignedPdfUrl(task.pdf_path, task.pdf_bucket);
    if (url) window.open(url, '_blank');
  }
},
              class: 'pdf-link'
            }, '[PDF]')
          ),

      !editingId && h('button', {
        class: 'btn btn-edit',
        onClick: () => startEdit(task)
      }, 'Sửa'),

      h('button', {
        class: 'btn btn-delete',
        onClick: () => deleteTask(task)
      }, 'Xóa')
    );

  return h('div', { class: 'tasks-container' },
    h('h2', { class: 'page-title' }, 'Tasks của tôi + PDF'),

    h('div', { class: 'add-task-form' },
      h('input', {
        class: 'new-task-input',
        placeholder: 'Nhập task mới...',
        value: newTitle,
        onInput: e => setNewTitle(e.target.value)
      }),

      h('div', { class: 'file-upload-wrapper' },
        h('label', null, 'Đính kèm PDF (tùy chọn):'),
        h('br'),
        h('input', {
          type: 'file',
          accept: '.pdf',
          class: 'file-input',
          ref: newFileInputRef,
          onChange: e => checkFile(e, setNewPdf)
        })
      ),

      h('div', { class: 'public-checkbox' },
        h('input', {
          type: 'checkbox',
          checked: newIsPublic,
          onChange: e => setNewIsPublic(e.target.checked)
        }),
        h('label', null, 'Làm PDF công khai (ai có link cũng xem được)')
      ),

      h('button', {
        class: `btn btn-add ${loading ? 'loading' : ''}`,
        onClick: addTask,
        disabled: loading
      }, loading ? 'Đang xử lý...' : 'Thêm')
    ),

    message && h('p', { class: 'message' }, message),

    loading && h('p', { class: 'loading-text' }, 'Đang tải...'),

    h('ul', { class: 'task-list' },
      tasks.map(task => TaskItem({ task }))
    )
  );
}


// /tasks/public → PublicTasks
/*
function PublicTasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchTasks();
  }, []);

  async function fetchTasks() {
    setLoading(true);

    const { data, error } = await supabase
      .from('tasks_new')
      .select('id,title,pdf_url,created_at')
      .order('created_at', { ascending: false });

    if (error) setMessage(error.message);
    else setTasks(data || []);

    setLoading(false);
  }

  // ================= TaskItem ================= 
    const TaskItem = (task) =>
  h('li', { key: task.id, className: 'task-item' },
    h('span', { className: 'task-title' }, task.title),

    task.pdf_url && h(
      'a',
      {
        href: task.pdf_url,
        target: '_blank',
        download: '',
        className: 'task-pdf'
      },
      'PDF'
    )
  );
    
    

  return h('div', null,
    h('h2', null, 'Tasks + PDF'),

    loading && h('p', null, 'Đang tải...'),
    message && h('p', null, message),

    //h('ul', null, tasks.map(TaskItem))
    h('ul', { className: 'task-list' }, tasks.map(TaskItem))
  );
}
*/


async function fetchTasks() {
  setLoading(true);

  const { data, error } = await supabase
    .from('tasks_new')
    .select('id, title, pdf_url, created_at')   // nếu có cột pdf_path thì select thêm pdf_path
    .order('created_at', { ascending: false });

  if (error) {
    setMessage(error.message);
    setTasks([]);
  } else {
    // Nếu pdf_url đang lưu đường dẫn tương đối (ví dụ: tasks-public/abc123.pdf)
    // thì tạo lại URL public đầy đủ
    const tasksWithPublicUrl = (data || []).map(task => {
      let publicPdfUrl = task.pdf_url;

      // Trường hợp 1: đã lưu full public URL → giữ nguyên
      if (publicPdfUrl?.startsWith('http')) {
        return { ...task, public_pdf_url: publicPdfUrl };
      }

      // Trường hợp 2: lưu đường dẫn tương đối trong bucket public
      if (publicPdfUrl && !publicPdfUrl.startsWith('http')) {
        // Thay 'tasks-public' bằng tên bucket thật của bạn nếu khác
        const bucketName = 'tasks-public';
        publicPdfUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/${bucketName}/${publicPdfUrl}`;
      }

      return {
        ...task,
        public_pdf_url: publicPdfUrl || null
      };
    });

    setTasks(tasksWithPublicUrl);
  }

  setLoading(false);
}

/* ================= TaskItem ================= */
const TaskItem = (task) =>
  h('li', { key: task.id, className: 'task-item' },
    h('span', { className: 'task-title' }, task.title),

    task.public_pdf_url &&
      h(
        'a',
        {
          href: task.public_pdf_url,
          target: '_blank',
          rel: 'noopener noreferrer',
          download: '',           // muốn tự động download thì giữ, không thì bỏ dòng này
          className: 'task-pdf'
        },
        'PDF'
      )
  );

return h('div', null,
  h('h2', null, 'Tasks + PDF'),

  loading && h('p', null, 'Đang tải...'),
  message && h('p', { style: { color: 'red' } }, message),

  h('ul', { className: 'task-list' }, tasks.map(TaskItem))
);



