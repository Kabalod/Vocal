'use client'
import { useEffect, useRef, useState } from 'react'
import { Lightbulb, MoreHorizontal } from 'lucide-react'
export function ThoughtBubble({text, role, note, grouped = false}: {text:string; role:string; note?:string; grouped?:boolean}) {
 const [value,setValue]=useState(text), [edit,setEdit]=useState(false), [draft,setDraft]=useState(text), [menu,setMenu]=useState(false)
 const timer=useRef<ReturnType<typeof setTimeout> | null>(null)
 useEffect(()=>{const close=()=>setMenu(false); const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){setMenu(false);setEdit(false)}}; window.addEventListener('click',close);window.addEventListener('keydown',key);return()=>{window.removeEventListener('click',close);window.removeEventListener('keydown',key);if(timer.current)clearTimeout(timer.current)}},[])
 return <article className={`message message-${role} ${grouped?'grouped':''}`} onContextMenu={e=>{if(role==='author'){e.preventDefault();setMenu(true)}}} onPointerDown={()=>{if(role==='author')timer.current=setTimeout(()=>setMenu(true),550)}} onPointerUp={()=>{if(timer.current)clearTimeout(timer.current)}} onPointerCancel={()=>{if(timer.current)clearTimeout(timer.current)}}>
 {edit?<div className="bubble-editor"><textarea aria-label="Исправить расшифровку" value={draft} onChange={e=>setDraft(e.target.value)} autoFocus/><button onClick={()=>{if(draft.trim()){setValue(draft);setEdit(false)}}}>Готово</button><button onClick={()=>setEdit(false)}>Отмена</button></div>:<p>{value}</p>}
 {role==='author'&&!edit&&<button className="bubble-more" aria-label="Действия с репликой" onClick={e=>{e.stopPropagation();setMenu(!menu)}}><MoreHorizontal/></button>}
 {menu&&<div className="apple-menu bubble-menu"><button onClick={()=>{setDraft(value);setEdit(true);setMenu(false)}}>Исправить расшифровку</button><button onClick={()=>navigator.clipboard.writeText(value).catch(()=>{})}>Копировать</button></div>}
 {note&&<p className="message-note"><Lightbulb/>{note}</p>}
 </article>
}
