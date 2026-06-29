<template>
  <div class="cat-page">
    <div class="page-header"><h2>玩法分类管理（2级）</h2><el-button type="primary" @click="openDialog(null)">新增大类</el-button></div>
    <el-card>
      <el-table :data="tree" border stripe row-key="_id" v-loading="loading">
        <el-table-column label="分类名称" min-width="200">
          <template #default="{row}">
            <span :style="{ paddingLeft: row.parentId ? '24px' : '0' }">{{ row.name }}</span>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="120"><template #default="{row}"><el-tag :type="row.parentId?'info':'primary'">{{ row.parentId?'小类':'大类' }}</el-tag></template></el-table-column>
        <el-table-column prop="sort" label="排序" width="80" />
        <el-table-column label="操作" width="240">
          <template #default="{row}">
            <el-button size="small" @click="openDialog(row, true)" v-if="!row.parentId">添加小类</el-button>
            <el-button size="small" @click="openDialog(row)">编辑</el-button>
            <el-popconfirm title="确定删除？" @confirm="doDelete(row)"><template #reference><el-button size="small" type="danger">删除</el-button></template></el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog :title="dialogTitle" v-model="dialogVisible" width="420px">
      <el-form :model="form" ref="formRef" label-width="80px">
        <el-form-item label="名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="排序"><el-input-number v-model="form.sort" :min="0" /></el-form-item>
        <el-form-item label="父分类" v-if="!form.parentId"><el-input value="无（大类）" disabled /></el-form-item>
        <el-form-item label="父分类" v-else><el-input :value="parentName" disabled /></el-form-item>
      </el-form>
      <template #footer><el-button @click="dialogVisible=false">取消</el-button><el-button type="primary" @click="doSave" :loading="saving">保存</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { getCategoryTree, createCategory, updateCategory, deleteCategory } from '@/api'

const loading=ref(false),saving=ref(false),tree=ref([]),flatList=ref([])
const load=async()=>{
  loading.value=true
  try{
    const res=await getCategoryTree();flatList.value=res.data.flat||[]
    const expanded=[]
    ;(res.data.tree||[]).forEach(big=>{const{children,...rest}=big;expanded.push(rest);(children||[]).forEach(small=>expanded.push({...small,_parentId:big._id}))})
    tree.value=expanded
  }catch(e){console.error(e)}
  loading.value=false
}
load()

const dialogVisible=ref(false),isEdit=ref(false),editId=ref('')
const formRef=ref(null),form=reactive({name:'',sort:0,parentId:null})
const parentName=computed(()=>{if(!form.parentId)return'';const p=flatList.value.find(c=>c._id===form.parentId);return p?p.name:''})
const dialogTitle=computed(()=>{if(!isEdit.value)return form.parentId?'新增小类':'新增大类';return'编辑分类'})

const openDialog=(row, isAddChild = false)=>{
  if (isAddChild) {
    // 添加小类：row 是父分类，新建子分类
    isEdit.value = false
    editId.value = ''
    form.name = ''
    form.sort = 0
    form.parentId = row._id
  } else if (row) {
    // 编辑现有分类
    isEdit.value = true
    editId.value = row._id
    form.name = row.name
    form.sort = row.sort || 0
    form.parentId = row.parentId || null
  } else {
    // 新增大类
    isEdit.value = false
    editId.value = ''
    Object.assign(form, { name: '', sort: 0, parentId: null })
  }
  dialogVisible.value = true
}
const doSave=async()=>{
  if(!form.name){ElMessage.warning('请输入名称');return}
  saving.value=true
  try{isEdit.value?await updateCategory(editId.value,{name:form.name,sort:form.sort}):await createCategory({...form,parentId:form.parentId||null});dialogVisible.value=false;load();ElMessage.success('保存成功')}
  catch(e){ElMessage.error(e.message||'操作失败')}
  saving.value=false
}
const doDelete=async(row)=>{try{await deleteCategory(row._id);ElMessage.success('已删除');load()}catch(e){ElMessage.error(e.message||'删除失败')}}
</script>

<style lang="scss" scoped>
.cat-page .page-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;h2{margin:0}}
</style>
