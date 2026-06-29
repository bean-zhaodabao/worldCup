<template>
  <div class="play-page">
    <div class="page-header"><h2>玩法管理</h2><el-button type="primary" @click="openDialog(null)">新增玩法</el-button></div>
    <el-card style="margin-bottom:16px">
      <el-form :inline="true">
        <el-form-item label="赛事"><el-select v-model="qf.matchId" placeholder="全部" clearable filterable style="width:200px"><el-option v-for="m in matchOptions" :key="m._id" :label="m.name" :value="m._id" /></el-select></el-form-item>
        <el-form-item><el-button type="primary" icon="Search" @click="loadList">搜索</el-button></el-form-item>
      </el-form>
    </el-card>
    <el-card>
      <el-table :data="list" border stripe v-loading="loading">
        <el-table-column label="赛事" width="160"><template #default="{row}">{{ row.matchName }}</template></el-table-column>
        <el-table-column label="分类" width="180"><template #default="{row}">{{ row.categoryPath }}</template></el-table-column>
        <el-table-column prop="name" label="玩法名称" min-width="150" />
        <el-table-column prop="odds" label="赔率" width="80" />
        <el-table-column label="中奖" width="80"><template #default="{row}"><el-tag :type="row.isWin?'success':'info'">{{ row.isWin?'是':'否' }}</el-tag></template></el-table-column>
        <el-table-column label="状态" width="80"><template #default="{row}"><el-tag v-if="row.deleted" type="danger">已下架</el-tag></template></el-table-column>
        <el-table-column label="操作" width="280">
          <template #default="{row}">
            <el-button size="small" @click="openDialog(row)">编辑</el-button>
            <el-button size="small" :type="row.isWin?'warning':'success'" @click="toggleWin(row)">{{ row.isWin?'取消中奖':'设为中奖' }}</el-button>
            <el-popconfirm :title="row.deleted ? '确定物理删除？此操作不可恢复' : '确定删除？已有订单将下架处理'" @confirm="doDelete(row)">
              <template #reference><el-button size="small" type="danger">{{ row.deleted ? '删除' : '下架' }}</el-button></template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination v-model:current-page="page" v-model:page-size="ps" :total="total" layout="total,prev,pager,next" style="margin-top:16px;justify-content:flex-end" @change="loadList" />
    </el-card>

    <el-dialog :title="dialogTitle" v-model="dialogVisible" width="480px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="赛事"><el-select v-model="form.matchId" placeholder="选择赛事" style="width:100%" filterable :disabled="isEdit"><el-option v-for="m in matchOptions" :key="m._id" :label="m.name" :value="m._id" /></el-select></el-form-item>
        <el-form-item label="玩法分类"><el-cascader v-model="form.categoryId" :options="catOptions" :props="{value:'_id',label:'name',emitPath:false}" placeholder="选择小类" style="width:100%" /></el-form-item>
        <el-form-item label="玩法名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="标识"><el-input v-model="form.label" placeholder="可选" /></el-form-item>
        <el-form-item label="赔率"><el-input-number v-model="form.odds" :min="1.01" :precision="2" :step="0.01" style="width:100%" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="dialogVisible=false">取消</el-button><el-button type="primary" @click="doSave" :loading="saving">保存</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getPlayList, createPlay, updatePlay, setPlayWin, deletePlay, getMatchList, getCategoryTree } from '@/api'

const loading=ref(false),saving=ref(false),list=ref([]),page=ref(1),ps=ref(20),total=ref(0)
const qf=reactive({matchId:''})
const loadList=async()=>{loading.value=true;try{const res=await getPlayList({...qf,page:page.value,pageSize:ps.value});list.value=res.data.list||[];total.value=res.data.total||0}catch(e){console.error(e)}loading.value=false}
const matchOptions=ref([]),catOptions=ref([])
onMounted(async()=>{const[ma,ca]=await Promise.all([getMatchList({pageSize:500}),getCategoryTree()]);matchOptions.value=ma.data.list||[];catOptions.value=(ca.data.tree||[]).map(b=>({_id:b._id,name:b.name,children:(b.children||[]).map(s=>({_id:s._id,name:s.name}))}));loadList()})

const dialogVisible=ref(false),isEdit=ref(false),editId=ref('')
const form=reactive({matchId:'',categoryId:'',name:'',label:'',odds:1.87})
const dialogTitle=computed(()=>isEdit.value?'编辑玩法':'新增玩法')
const openDialog=(row)=>{isEdit.value=!!row;if(row){editId.value=row._id;form.matchId=row.matchId;form.categoryId=row.categoryId;form.name=row.name;form.label=row.label||'';form.odds=row.odds}else{editId.value='';Object.assign(form,{matchId:'',categoryId:'',name:'',label:'',odds:1.87})};dialogVisible.value=true}
const doSave=async()=>{if(!form.matchId||!form.categoryId||!form.name){ElMessage.warning('请填写必填项');return};saving.value=true;try{isEdit.value?await updatePlay(editId.value,{...form,_oldOdds:list.value.find(p=>p._id===editId.value)?.odds}):await createPlay({...form});dialogVisible.value=false;loadList();ElMessage.success('保存成功')}catch(e){ElMessage.error(e.message||'操作失败')};saving.value=false}
const toggleWin=async(row)=>{try{await setPlayWin(row._id,!row.isWin);ElMessage.success('已更新');loadList()}catch(e){ElMessage.error(e.message||'操作失败')}}
const doDelete=async(row)=>{try{await deletePlay(row._id);ElMessage.success(row.deleted?'已删除':'已下架');loadList()}catch(e){ElMessage.error(e.message||'删除失败')}}
</script>

<style lang="scss" scoped>
.play-page .page-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;h2{margin:0}}
</style>
