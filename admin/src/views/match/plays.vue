<template>
  <div class="match-plays">
    <div class="page-header">
      <h2>赛事玩法 - {{ matchName }}</h2>
      <div><el-button @click="openCopyDialog">从其他赛事复制玩法</el-button><el-button type="primary" @click="openPlayDialog(null)">新增玩法</el-button></div>
    </div>
    <el-card>
      <el-table :data="list" border stripe v-loading="loading">
        <el-table-column label="分类（大类/小类）" width="200"><template #default="{row}">{{ row.categoryPath || row.categoryName }}</template></el-table-column>
        <el-table-column prop="name" label="玩法名称" min-width="150" />
        <el-table-column prop="label" label="标识" width="100" />
        <el-table-column label="赔率" width="160">
          <template #default="{row}"><el-input-number v-model="row.odds" :min="1.01" :precision="2" :step="0.01" size="small" controls-position="right" style="width:130px" @change="(v)=>updateOdds(row,v)" /></template>
        </el-table-column>
        <el-table-column label="中奖" width="120">
          <template #default="{row}"><el-switch v-model="row.isWin" @change="(v)=>setWin(row,v)" /></template>
        </el-table-column>
        <el-table-column label="状态" width="80">
          <template #default="{row}"><el-tag v-if="row.deleted" type="danger">已下架</el-tag></template>
        </el-table-column>
        <el-table-column label="操作" width="180">
          <template #default="{row}">
            <el-button size="small" @click="openPlayDialog(row)">编辑</el-button>
            <el-popconfirm :title="row.deleted ? '确定物理删除？此操作不可恢复' : '确定删除？已有订单将下架处理'" @confirm="doDelete(row)"><template #reference><el-button size="small" type="danger">{{ row.deleted ? '删除' : '下架' }}</el-button></template></el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog :title="playDialogTitle" v-model="playVisible" width="480px">
      <el-form :model="playForm" label-width="100px">
        <el-form-item label="玩法分类" required>
          <el-cascader v-model="playForm.categoryId" :options="catOptions" :props="{value:'_id',label:'name',emitPath:false}" placeholder="选择小类" style="width:100%" />
        </el-form-item>
        <el-form-item label="玩法名称"><el-input v-model="playForm.name" /></el-form-item>
        <el-form-item label="标识"><el-input v-model="playForm.label" placeholder="可选" /></el-form-item>
        <el-form-item label="赔率"><el-input-number v-model="playForm.odds" :min="1.01" :precision="2" :step="0.01" style="width:100%" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="playVisible=false">取消</el-button><el-button type="primary" @click="doSavePlay" :loading="saving">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog title="复制玩法" v-model="copyVisible" width="480px">
      <el-form label-width="100px">
        <el-form-item label="来源赛事"><el-select v-model="copyFrom" placeholder="选择赛事" style="width:100%" filterable><el-option v-for="m in matchOptions" :key="m._id" :label="m.name+' ('+m.teamA+' vs '+m.teamB+')'" :value="m._id" /></el-select></el-form-item>
        <el-form-item label="目标赛事"><el-input :value="matchName" disabled /></el-form-item>
      </el-form>
      <template #footer><el-button @click="copyVisible=false">取消</el-button><el-button type="primary" @click="doCopy">确认复制</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getMatchList, getPlayList, createPlay, updatePlay, deletePlay, setPlayWin, copyPlays, getCategoryTree } from '@/api'

const route = useRoute(); const matchId = route.params.id
const matchName = ref(''); const loading = ref(false); const saving = ref(false); const list = ref([])

const loadList = async () => {
  loading.value = true
  try { const res = await getPlayList({ matchId, pageSize: 500 }); list.value = res.data.list || [] } catch (e) { console.error(e) }
  loading.value = false
}
const loadMatch = async () => {
  const res = await getMatchList({ pageSize: 500 })
  const m = (res.data.list||[]).find(m=>m._id===matchId)
  if(m) matchName.value = m.name+' ('+m.teamA+' vs '+m.teamB+')'
}
const catOptions = ref([])
const loadCats = async () => {
  const res = await getCategoryTree()
  catOptions.value = (res.data.tree||[]).map(big=>({_id:big._id,name:big.name,children:(big.children||[]).map(s=>({_id:s._id,name:s.name}))}))
}
const matchOptions = ref([])
const loadMOptions = async () => {
  const res = await getMatchList({ pageSize: 500 })
  matchOptions.value = (res.data.list||[]).filter(m=>m._id!==matchId)
}
onMounted(()=>{loadMatch();loadList();loadCats();loadMOptions()})

const playVisible=ref(false),isPlayEdit=ref(false),editPlayId=ref('')
const playForm=reactive({categoryId:'',name:'',label:'',odds:1.87})
const playDialogTitle=computed(()=>isPlayEdit.value?'编辑玩法':'新增玩法')
const openPlayDialog=(row)=>{
  isPlayEdit.value=!!row
  if(row){editPlayId.value=row._id;playForm.categoryId=row.categoryId;playForm.name=row.name;playForm.label=row.label||'';playForm.odds=row.odds}
  else{editPlayId.value='';Object.assign(playForm,{categoryId:'',name:'',label:'',odds:1.87})}
  playVisible.value=true
}
const doSavePlay=async()=>{
  if(!playForm.categoryId||!playForm.name){ElMessage.warning('请填写必填项');return}
  saving.value=true
  try{isPlayEdit.value?await updatePlay(editPlayId.value,{...playForm,_oldOdds:list.value.find(p=>p._id===editPlayId.value)?.odds}):await createPlay({...playForm,matchId});playVisible.value=false;loadList();ElMessage.success('保存成功')}
  catch(e){ElMessage.error(e.message||'操作失败')}
  saving.value=false
}
const doDelete=async(row)=>{try{await deletePlay(row._id);ElMessage.success(row.deleted?'已删除':'已下架');loadList()}catch(e){ElMessage.error(e.message||'删除失败')}}
const updateOdds=async(row,val)=>{try{await updatePlay(row._id,{odds:val,_oldOdds:row.odds})}catch(e){ElMessage.error(e.message||'失败');loadList()}}
const setWin=async(row,val)=>{try{await setPlayWin(row._id,val)}catch(e){ElMessage.error(e.message||'失败');loadList()}}

const copyVisible=ref(false),copyFrom=ref('')
const openCopyDialog=()=>{copyVisible.value=true;copyFrom.value=''}
const doCopy=async()=>{
  if(!copyFrom.value){ElMessage.warning('请选择来源赛事');return}
  try{await copyPlays(copyFrom.value,matchId);ElMessage.success('已复制');copyVisible.value=false;loadList()}
  catch(e){ElMessage.error(e.message||'复制失败')}
}
</script>

<style lang="scss" scoped>
.match-plays .page-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;h2{margin:0}}
</style>
